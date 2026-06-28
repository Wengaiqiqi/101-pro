class NotFoundError(Exception):
    def __init__(self, detail: str = "Resource not found"):
        self.detail = detail
        super().__init__(detail)


class BadRequestError(Exception):
    def __init__(self, detail: str = "Bad request"):
        self.detail = detail
        super().__init__(detail)


class ForbiddenError(Exception):
    def __init__(self, detail: str = "Forbidden"):
        self.detail = detail
        super().__init__(detail)
