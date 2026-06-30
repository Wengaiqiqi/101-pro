"""Tests for core security functions."""
import pytest

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.services.llm_client import _normalize_page_question
from app.services.model_settings_service import _validate_base_url
from jose.exceptions import JWTError


class TestPasswordHashing:
    def test_hash_and_verify(self):
        password = "SecurePass123"
        hashed = hash_password(password)
        assert hashed != password
        assert verify_password(password, hashed) is True

    def test_wrong_password_rejected(self):
        hashed = hash_password("CorrectPass123")
        assert verify_password("WrongPass123", hashed) is False

    def test_different_hashes_for_same_password(self):
        password = "SecurePass123"
        hash1 = hash_password(password)
        hash2 = hash_password(password)
        # bcrypt produces different salts each time
        assert hash1 != hash2
        assert verify_password(password, hash1) is True
        assert verify_password(password, hash2) is True


class TestTokenCreation:
    def test_create_and_decode_token(self):
        token = create_access_token("42", 1)
        payload = decode_access_token(token)
        assert payload["sub"] == "42"
        assert payload["pwd_ver"] == 1
        assert "exp" in payload

    def test_invalid_token_raises(self):
        with pytest.raises(JWTError):
            decode_access_token("invalid.token.here")

    def test_empty_token_raises(self):
        with pytest.raises((JWTError, Exception)):
            decode_access_token("")

    def test_token_contains_subject(self):
        token = create_access_token("user-99", 2)
        payload = decode_access_token(token)
        assert payload["sub"] == "user-99"
        assert payload["pwd_ver"] == 2


def test_llm_boolean_parser_rejects_string_false() -> None:
    with pytest.raises(ValueError, match="boolean"):
        _normalize_page_question(
            {
                "type": "single_choice",
                "answer": {"label": "B"},
                "options": [
                    {"label": "A", "content": "wrong", "is_correct": "false"},
                    {"label": "B", "content": "right", "is_correct": "true"},
                ],
            }
        )


@pytest.mark.parametrize("url", ["http://localhost./v1", "http://127.0.0.1.nip.io/v1"])
def test_model_base_url_rejects_hostnames_resolving_to_loopback(monkeypatch, url: str) -> None:
    monkeypatch.setattr(
        "socket.getaddrinfo",
        lambda *args, **kwargs: [(2, 1, 6, "", ("127.0.0.1", 80))],
    )

    with pytest.raises(Exception, match="内部|私有"):
        _validate_base_url(url)
