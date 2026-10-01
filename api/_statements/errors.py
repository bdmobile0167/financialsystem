class StatementError(Exception):
    def __init__(self, status, code, message, **extra):
        super().__init__(message)
        self.status = status
        self.body = {"ok": False, "code": code, "message": message, **extra}
