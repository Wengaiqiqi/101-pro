"""Common validation functions for the application."""
from app.core.exceptions import BadRequestError


def validate_password_strength(password: str) -> None:
    """
    Validate password strength requirements.

    Raises:
        BadRequestError: If password doesn't meet requirements
    """
    if len(password) < 8:
        raise BadRequestError("密码长度不能少于8个字符")
    has_letter = any(c.isalpha() for c in password)
    has_digit = any(c.isdigit() for c in password)
    if not (has_letter and has_digit):
        raise BadRequestError("密码必须包含至少一个字母和一个数字")
