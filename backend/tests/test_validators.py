"""Tests for password validation."""
import pytest

from app.core.exceptions import BadRequestError
from app.core.validators import validate_password_strength


class TestPasswordStrength:
    def test_valid_password_accepted(self):
        validate_password_strength("SecurePass123")  # Should not raise

    def test_too_short_rejected(self):
        with pytest.raises(BadRequestError):
            validate_password_strength("Ab1")

    def test_no_digit_rejected(self):
        with pytest.raises(BadRequestError):
            validate_password_strength("OnlyLetters")

    def test_no_letter_rejected(self):
        with pytest.raises(BadRequestError):
            validate_password_strength("12345678")

    def test_exactly_8_chars_with_letter_and_digit(self):
        validate_password_strength("Abcdef1g")  # Should not raise
