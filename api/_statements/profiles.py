from dataclasses import dataclass


@dataclass(frozen=True)
class Profile:
    bank: str
    suffix: str
    date_format: str = "YYYY/MM/DD or ROC YYY/MM/DD"
    continuation_separator: str = "｜"
    text_columns: tuple = ("expense", "income", "balance")
    noise: tuple = ("查詢人員", "查詢時間", "戶名", "設帳行", "列印", "頁次", "page:", "存款明細表", "交易明細", "Mega International")


PROFILES = {"玉山187": Profile("玉山", "187")}
PROFILES.update({f"兆豐{suffix}": Profile("兆豐", suffix) for suffix in ("347", "335", "359", "703", "182", "697")})
HEADERS = {
    "expense": ("支出金額", "提出金額", "提款金額", "支出", "提出", "借方金額"),
    "income": ("存入金額", "收入金額", "收入", "存入", "貸方金額"),
    "balance": ("帳戶餘額", "帳面餘額", "結存金額", "餘額", "結存"),
}


def capabilities():
    return {"ok": True, "supported": list(PROFILES), "profiles": [
        {"bankCode": code, "bank": p.bank, "account_suffix": p.suffix,
         "validation": "synthetic_only"} for code, p in PROFILES.items()],
        "max_file_bytes": 3 * 1024 * 1024, "max_pages": 30}
