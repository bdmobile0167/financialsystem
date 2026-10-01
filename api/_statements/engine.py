import base64
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import BytesIO
import re
import time

from .errors import StatementError
from .profiles import HEADERS, PROFILES

MAX_FILE_BYTES = 3 * 1024 * 1024
MAX_PAGES = 30
DATE = re.compile(r"(?<!\d)(\d{3,4})[/-](\d{2})[/-](\d{2})(?!\d)")
MONEY = re.compile(r"^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$")
CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def amount(text):
    value = Decimal(text.replace(",", "")).quantize(CENT, rounding=ROUND_HALF_UP)
    # JSON / browser numbers must retain cents exactly at the supported scale.
    if not value.is_finite() or abs(value) > Decimal("999999999999.99"):
        raise ValueError("invalid_amount")
    return value


def decode_payload(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("bankCode"), str):
        raise StatementError(400, "invalid_request", "請提供 bankCode 與 fileBase64。")
    code = payload["bankCode"]
    if code not in PROFILES:
        raise StatementError(400, "unsupported_bank", "此帳戶尚無可用的解析規則。", supported=list(PROFILES))
    encoded = payload.get("fileBase64")
    if not isinstance(encoded, str):
        raise StatementError(400, "invalid_request", "請提供 PDF 的 base64 內容。")
    if len(encoded) > 4 * ((MAX_FILE_BYTES + 2) // 3):
        raise StatementError(413, "file_too_large", "PDF 不可超過 3 MB。")
    try:
        content = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError):
        raise StatementError(400, "invalid_base64", "檔案編碼無效。") from None
    if not content:
        raise StatementError(422, "empty_file", "PDF 檔案是空的。")
    if len(content) > MAX_FILE_BYTES:
        raise StatementError(413, "file_too_large", "PDF 不可超過 3 MB。")
    if not content.startswith(b"%PDF-"):
        raise StatementError(400, "not_pdf", "請上傳有效的 PDF 檔案。")
    return content, code


def group_lines(words):
    lines = []
    for word in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if not lines or abs(word["top"] - lines[-1][0]["top"]) > 3:
            lines.append([])
        lines[-1].append(word)
    return [sorted(line, key=lambda w: w["x0"]) for line in lines]


def header_columns(words):
    found = {}
    # Some PDFs split a Chinese label into individual glyphs.
    for i in range(len(words)):
        for width in range(1, min(6, len(words) - i) + 1):
            group = words[i:i + width]
            if any(b["x0"] - a["x1"] > 12 for a, b in zip(group, group[1:])):
                break
            label = "".join(w["text"] for w in group)
            for field, names in HEADERS.items():
                if label in names:
                    found[field] = (group[0]["x0"] + group[-1]["x1"]) / 2
    return found


def classify_money(words, columns):
    values = {}
    for word in words:
        center = (word["x0"] + word["x1"]) / 2
        field = min(columns, key=lambda key: abs(columns[key] - center))
        if field in values:
            raise ValueError("ambiguous_columns")
        values[field] = amount(word["text"])
    return values


def text_amounts(tokens, profile, order=None):
    """Explicit fallback: never infer direction from the first amount."""
    numbers = [amount(t) for t in tokens if MONEY.fullmatch(t)]
    if len(numbers) == 3:
        if order is None:
            raise ValueError("ambiguous_direction")
        return dict(zip(order, numbers))
    direction = " ".join(tokens)
    expense = bool(re.search(r"(?:支出|提出|提款|借方)", direction))
    income = bool(re.search(r"(?:收入|存入|貸方)", direction))
    if len(numbers) not in (1, 2) or expense == income:
        raise ValueError("ambiguous_direction")
    result = {"expense" if expense else "income": numbers[0]}
    if len(numbers) == 2:
        result["balance"] = numbers[1]
    return result


def parse_pages(pages, bank_code):
    profile = PROFILES[bank_code]
    records, warnings, rejected, source_rows = [], [], [], []
    totals, line_number, columns = [], 0, {}
    all_text = "\n".join(" ".join(w["text"] for w in page) for page in pages)
    if profile.bank not in all_text:
        raise StatementError(422, "layout_mismatch", "PDF 版面與所選銀行不符。")
    # Verify account suffix only when an account field can be read unambiguously.
    for page in pages:
        for line in group_lines(page):
            text = " ".join(w["text"] for w in line)
            match = re.search(r"帳號\s*[:：]?\s*([\d*Xx-]{3,})", text)
            if match and not match[1].replace("-", "").endswith(profile.suffix):
                raise StatementError(422, "account_mismatch", "PDF 帳戶與所選解析規則不符。")
    current = None
    text_order = None
    for page_index, page in enumerate(pages, 1):
        if not page:
            warnings.append({"row": 0, "page": page_index, "code": "page_no_text", "message": f"第 {page_index} 頁沒有文字層，請確認是否漏了掃描交易。"})
        columns = {}  # coordinates can change between pages
        page_start = len(records)
        for words in group_lines(page):
            line_number += 1
            text = " ".join(w["text"] for w in words).strip()
            new_columns = header_columns(words)
            if new_columns and not DATE.search(text) and not any(MONEY.fullmatch(w["text"]) for w in words):
                columns.update(new_columns)
                if len(columns) == 3:
                    text_order = tuple(sorted(columns, key=columns.get))
                current = None
                continue
            if re.search(r"本頁合計|累計|總計|合計", text) and not DATE.search(text):
                money_words = [w for w in words if MONEY.fullmatch(w["text"])]
                if len(columns) == 3 and money_words:
                    try:
                        values = classify_money(money_words, columns)
                        totals.append((line_number, values, page_start if "本頁" in text else 0, len(records)))
                    except ValueError:
                        warnings.append({"row": line_number, "code": "totals_unverifiable", "message": "合計欄位無法辨識，請人工核對。"})
                else:
                    warnings.append({"row": line_number, "code": "totals_unverifiable", "message": "合計欄位無法辨識，請人工核對。"})
                current = None
                continue
            is_noise = any(noise in text for noise in profile.noise) or re.search(r"帳號|第\s*\d+\s*頁", text) or profile.bank in text
            if not text or (is_noise and not (DATE.search(text) and any(MONEY.fullmatch(w["text"]) for w in words))):
                current = None
                continue
            date_match = DATE.search(text)
            money_words = [w for w in words if MONEY.fullmatch(w["text"])]
            # Numeric account/id tokens left of the transaction date are not money.
            if date_match:
                date_word = next((w for w in words if DATE.search(w["text"])), None)
                money_words = [w for w in money_words if date_word is None or w["x0"] > date_word["x0"]]
            if not date_match and not money_words:
                if current is not None:
                    records[current]["detail"] += profile.continuation_separator + text
                else:
                    rejected.append({"row": line_number, "reason": "unclassified_line", "raw_preview": ""})
                continue
            reason = None
            try:
                if not date_match:
                    raise ValueError("missing_date")
                year, month, day = map(int, date_match.groups())
                if year < 1000:
                    year += 1911
                try:
                    normalized_date = date(year, month, day).isoformat()
                except ValueError:
                    raise ValueError("invalid_date") from None
                if not money_words:
                    raise ValueError("missing_amount")
                if len(columns) == 3:
                    values = classify_money(money_words, columns)
                elif profile.bank == "玉山":
                    tokens = text.split()
                    # Documented legacy 玉山187 positions; require every slot.
                    if len(tokens) < 9 or not DATE.fullmatch(tokens[1]) or not all(MONEY.fullmatch(t) for t in tokens[5:8]):
                        raise ValueError("unsupported_layout")
                    values = dict(zip(profile.text_columns, map(amount, tokens[5:8])))
                else:
                    values = text_amounts([w["text"] for w in words if w in money_words or not MONEY.fullmatch(w["text"])], profile, text_order)
                expense, income = values.get("expense", ZERO), values.get("income", ZERO)
                balance = values.get("balance")
                if expense < 0 or income < 0 or (balance is not None and balance < 0):
                    raise ValueError("negative_amount")
                if expense and income:
                    raise ValueError("ambiguous_direction")
                detail_words = [w["text"] for w in words if w not in money_words and not DATE.search(w["text"])]
                counterparty = ""
                if profile.bank == "玉山" and len(columns) != 3:
                    detail_words, counterparty = [tokens[4]], " ".join(tokens[8:])
                detail = " ".join(detail_words)
                records.append({"date": normalized_date, "detail": detail, "counterparty": counterparty,
                                "expense": expense, "income": income, "balance": balance})
                source_rows.append(line_number)
                current = len(records) - 1
            except (ValueError, InvalidOperation) as error:
                reason = str(error) if str(error) in {"missing_date", "invalid_date", "missing_amount", "unsupported_layout", "ambiguous_direction", "ambiguous_columns", "negative_amount", "invalid_amount"} else "invalid_amount"
            if reason:
                rejected.append({"row": line_number, "reason": reason, "raw_preview": ""})
                current = None
    checks, failed, previous, seen = 0, False, None, set()
    for index, record in enumerate(records):
        row = source_rows[index]
        if len(record["detail"]) > 500 or len(record["counterparty"]) > 300:
            warnings.append({"row": row, "record_index": index, "code": "text_too_long", "message": "摘要或對象超過匯入長度限制，請取消勾選。"})
        if not record["income"] and not record["expense"]:
            warnings.append({"row": row, "record_index": index, "code": "zero_amount", "message": "零金額列保留預覽，匯入時會跳過。"})
        key = tuple(record.values())
        if key in seen:
            warnings.append({"row": row, "record_index": index, "code": "possible_duplicate", "message": "此列可能與檔內其他列重複。"})
        seen.add(key)
        if previous is not None and record["balance"] is not None and previous["balance"] is not None:
            checks += 1
            if record["balance"] != previous["balance"] + record["income"] - record["expense"]:
                failed = True
                warnings.append({"row": row, "record_index": index, "code": "balance_mismatch", "message": "餘額與前一列推算不符。"})
        previous = record
    for row, values, start, end in totals:
        if any(values.get(field) is not None and values[field] != sum((r[field] for r in records[start:end]), ZERO) for field in ("expense", "income")):
            warnings.append({"row": row, "code": "total_mismatch", "message": "PDF 合計與解析交易加總不符。"})
    if not records:
        raise StatementError(422, "no_transactions", f"找不到可解析交易；有 {len(rejected)} 列無法辨識，請確認銀行版面。", rejected_rows=rejected, warnings=warnings)
    for record in records:
        for field in ("expense", "income", "balance"):
            if record[field] is not None:
                record[field] = float(record[field])
    return {"ok": True, "count": len(records), "records": records, "warnings": warnings,
            "rejected_rows": rejected, "stats": {"pages": len(pages), "rows_total": len(records) + len(rejected),
            "rows_ok": len(records), "balance_check": "failed" if failed else "passed" if checks else "skipped"}}


def parse_pdf(content, bank_code):
    import pdfplumber
    from pdfminer.pdfdocument import PDFPasswordIncorrect
    deadline = time.monotonic() + 18
    try:
        with pdfplumber.open(BytesIO(content)) as pdf:
            if len(pdf.pages) > MAX_PAGES:
                raise StatementError(422, "too_many_pages", "PDF 最多可解析 30 頁。")
            pages = []
            for page in pdf.pages:
                if time.monotonic() > deadline:
                    raise StatementError(422, "parse_timeout", "解析逾時，請拆分 PDF 後再試。")
                pages.append(page.extract_words(x_tolerance=2, y_tolerance=3))
        if not any(pages):
            raise StatementError(422, "no_text_layer", "此 PDF 沒有文字層，請使用可選取文字的對帳單。")
        return parse_pages(pages, bank_code)
    except StatementError:
        raise
    except PDFPasswordIncorrect:
        raise StatementError(422, "encrypted_pdf", "請先移除 PDF 密碼保護再上傳。") from None
    except Exception:
        raise StatementError(422, "invalid_pdf", "PDF 無法讀取，請確認檔案完整且未加密。") from None
