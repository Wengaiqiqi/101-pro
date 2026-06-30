"""Tests for user endpoints."""
import os

os.environ.setdefault("DATABASE_URL", "sqlite://")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.models.user import User
from app.core.security import hash_password


# ── Fixtures ───────────────────────────────────────────────────────

@pytest.fixture
def db_session():
    """Create a fresh database for each test."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestSessionLocal = sessionmaker(bind=engine)
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session):
    """Create a test client with overridden database."""
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c


# ── Helpers ────────────────────────────────────────────────────────

def _create_user(db: Session, username: str, password: str, role: str = "user") -> User:
    user = User(
        username=username,
        nickname=username,
        password_hash=hash_password(password),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _login(client: TestClient, username: str, password: str) -> str:
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ── Tests ──────────────────────────────────────────────────────────

class TestUserMe:
    def test_get_current_user(self, client, db_session):
        """User can get their own profile."""
        _create_user(db_session, "user1", "password123")

        token = _login(client, "user1", "password123")
        response = client.get("/api/users/me", headers=_headers(token))
        assert response.status_code == 200
        user = response.json()
        assert user["username"] == "user1"
        assert user["nickname"] == "user1"
        assert user["role"] == "user"

    def test_get_current_user_requires_auth(self, client, db_session):
        """Getting current user requires authentication."""
        response = client.get("/api/users/me")
        assert response.status_code in (401, 403)  # HTTPBearer returns 401 or 403 when no token


class TestUserUpdateProfile:
    def test_update_nickname(self, client, db_session):
        """User can update their nickname."""
        _create_user(db_session, "user1", "password123")

        token = _login(client, "user1", "password123")
        response = client.put(
            "/api/users/me",
            json={"nickname": "新昵称"},
            headers=_headers(token),
        )
        assert response.status_code == 200
        user = response.json()
        assert user["nickname"] == "新昵称"

    def test_update_profile_requires_auth(self, client, db_session):
        """Updating profile requires authentication."""
        response = client.put("/api/users/me", json={"nickname": "新昵称"})
        assert response.status_code in (401, 403)


class TestUserChangePassword:
    def test_change_password(self, client, db_session):
        """User can change their password."""
        _create_user(db_session, "user1", "password123")

        token = _login(client, "user1", "password123")
        response = client.put(
            "/api/users/me/change-password",
            json={"old_password": "password123", "new_password": "newpass123"},
            headers=_headers(token),
        )
        assert response.status_code == 200
        assert response.json()["message"] == "密码修改成功"

        # Verify can login with new password
        new_token = _login(client, "user1", "newpass123")
        assert new_token is not None

    def test_change_password_wrong_old_password(self, client, db_session):
        """Changing password with wrong old password fails."""
        _create_user(db_session, "user1", "password123")

        token = _login(client, "user1", "password123")
        response = client.put(
            "/api/users/me/change-password",
            json={"old_password": "wrongpassword", "new_password": "newpass123"},
            headers=_headers(token),
        )
        assert response.status_code == 400
        assert "原密码错误" in response.json()["detail"]

    def test_change_password_weak_new_password(self, client, db_session):
        """Changing password with weak new password fails."""
        _create_user(db_session, "user1", "password123")

        token = _login(client, "user1", "password123")

        # Too short
        response = client.put(
            "/api/users/me/change-password",
            json={"old_password": "password123", "new_password": "short1"},
            headers=_headers(token),
        )
        assert response.status_code in (400, 422)  # Pydantic or custom validation

        # No digit
        response = client.put(
            "/api/users/me/change-password",
            json={"old_password": "password123", "new_password": "onlyletters"},
            headers=_headers(token),
        )
        assert response.status_code in (400, 422)

        # No letter
        response = client.put(
            "/api/users/me/change-password",
            json={"old_password": "password123", "new_password": "12345678"},
            headers=_headers(token),
        )
        assert response.status_code in (400, 422)

    def test_change_password_invalidates_old_token(self, client, db_session):
        """Changing password invalidates the old token."""
        _create_user(db_session, "user1", "password123")

        old_token = _login(client, "user1", "password123")

        # Change password
        response = client.put(
            "/api/users/me/change-password",
            json={"old_password": "password123", "new_password": "newpass123"},
            headers=_headers(old_token),
        )
        assert response.status_code == 200

        # Old token should be invalid
        response = client.get("/api/users/me", headers=_headers(old_token))
        assert response.status_code == 401

        # New token should work
        new_token = _login(client, "user1", "newpass123")
        response = client.get("/api/users/me", headers=_headers(new_token))
        assert response.status_code == 200


class TestUserAvatar:
    def test_upload_avatar_requires_auth(self, client, db_session):
        """Uploading avatar requires authentication."""
        response = client.post("/api/users/me/avatar", files={"file": ("test.jpg", b"fake image", "image/jpeg")})
        assert response.status_code in (401, 403)
