from fastapi.testclient import TestClient
import pytest

from app.core.config import Settings


def test_register_login_and_me(client: TestClient) -> None:
    register_response = client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "secret1234"},
    )
    assert register_response.status_code == 201

    login_response = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "secret1234"},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]

    me_response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_response.status_code == 200
    assert me_response.json()["username"] == "alice"


def test_register_rejects_duplicate_username(client: TestClient) -> None:
    first_response = client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "secret1234"},
    )
    assert first_response.status_code == 201

    duplicate_username = client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "secret1234"},
    )
    assert duplicate_username.status_code == 400


def test_login_rejects_bad_credentials(client: TestClient) -> None:
    client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "secret1234"},
    )

    response = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "wrong-password"},
    )

    assert response.status_code == 401


def test_login_with_username(client: TestClient) -> None:
    client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "secret1234"},
    )

    response = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "secret1234"},
    )

    assert response.status_code == 200


def test_production_rejects_default_secrets() -> None:
    settings = Settings(app_env="production")

    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        settings.validate_for_runtime()


def test_production_rejects_default_encryption_secret() -> None:
    settings = Settings(
        app_env="production",
        jwt_secret_key="x" * 32,
    )

    with pytest.raises(RuntimeError, match="API_KEY_ENCRYPTION_SECRET"):
        settings.validate_for_runtime()


def test_production_requires_explicit_admin_password() -> None:
    settings = Settings(
        app_env="production",
        jwt_secret_key="x" * 32,
        api_key_encryption_secret="y" * 32,
        cors_origins="https://example.test",
        admin_password="",
    )

    with pytest.raises(RuntimeError, match="ADMIN_PASSWORD"):
        settings.validate_for_runtime()
