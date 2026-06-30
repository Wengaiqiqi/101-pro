"""Tests for admin endpoints."""
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

class TestAdminListUsers:
    def test_list_users_requires_admin(self, client, db_session):
        """Non-admin users cannot list users."""
        _create_user(db_session, "user1", "password123")
        token = _login(client, "user1", "password123")
        response = client.get("/api/admin/users", headers=_headers(token))
        assert response.status_code == 403

    def test_list_users_returns_all_users(self, client, db_session):
        """Admin can list all users."""
        _create_user(db_session, "admin1", "admin123", role="admin")
        _create_user(db_session, "user1", "password123")
        _create_user(db_session, "user2", "password456")

        token = _login(client, "admin1", "admin123")
        response = client.get("/api/admin/users", headers=_headers(token))
        assert response.status_code == 200
        users = response.json()
        assert len(users) == 3
        usernames = [u["username"] for u in users]
        assert "admin1" in usernames
        assert "user1" in usernames
        assert "user2" in usernames


class TestAdminUpdateUser:
    def test_update_user_active_status(self, client, db_session):
        """Admin can toggle user active status."""
        _create_user(db_session, "admin1", "admin123", role="admin")
        user = _create_user(db_session, "user1", "password123")
        user_id = user.id

        token = _login(client, "admin1", "admin123")

        # Deactivate user
        response = client.patch(
            f"/api/admin/users/{user_id}",
            json={"is_active": False},
            headers=_headers(token),
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is False

        # Activate user
        response = client.patch(
            f"/api/admin/users/{user_id}",
            json={"is_active": True},
            headers=_headers(token),
        )
        assert response.status_code == 200
        assert response.json()["is_active"] is True

    def test_update_user_requires_admin(self, client, db_session):
        """Non-admin users cannot update users."""
        _create_user(db_session, "user1", "password123")
        user2 = _create_user(db_session, "user2", "password456")
        user2_id = user2.id

        token = _login(client, "user1", "password123")
        response = client.patch(
            f"/api/admin/users/{user2_id}",
            json={"is_active": False},
            headers=_headers(token),
        )
        assert response.status_code == 403

    def test_admin_cannot_update_self(self, client, db_session):
        """Admin cannot update their own account."""
        admin = _create_user(db_session, "admin1", "admin123", role="admin")
        admin_id = admin.id

        token = _login(client, "admin1", "admin123")
        response = client.patch(
            f"/api/admin/users/{admin_id}",
            json={"is_active": False},
            headers=_headers(token),
        )
        assert response.status_code == 400
        assert "不能修改自己的账号" in response.json()["detail"]

    def test_update_nonexistent_user(self, client, db_session):
        """Updating a nonexistent user returns 404."""
        _create_user(db_session, "admin1", "admin123", role="admin")

        token = _login(client, "admin1", "admin123")
        response = client.patch(
            "/api/admin/users/99999",
            json={"is_active": False},
            headers=_headers(token),
        )
        assert response.status_code == 404


class TestAdminDeleteUser:
    def test_delete_user(self, client, db_session):
        """Admin can delete users."""
        _create_user(db_session, "admin1", "admin123", role="admin")
        user = _create_user(db_session, "user1", "password123")
        user_id = user.id

        token = _login(client, "admin1", "admin123")
        response = client.delete(f"/api/admin/users/{user_id}", headers=_headers(token))
        assert response.status_code == 204

        # Verify user is deleted
        deleted_user = db_session.get(User, user_id)
        assert deleted_user is None

    def test_delete_user_requires_admin(self, client, db_session):
        """Non-admin users cannot delete users."""
        _create_user(db_session, "user1", "password123")
        user2 = _create_user(db_session, "user2", "password456")
        user2_id = user2.id

        token = _login(client, "user1", "password123")
        response = client.delete(f"/api/admin/users/{user2_id}", headers=_headers(token))
        assert response.status_code == 403

    def test_admin_cannot_delete_self(self, client, db_session):
        """Admin cannot delete their own account."""
        admin = _create_user(db_session, "admin1", "admin123", role="admin")
        admin_id = admin.id

        token = _login(client, "admin1", "admin123")
        response = client.delete(f"/api/admin/users/{admin_id}", headers=_headers(token))
        assert response.status_code == 400
        assert "不能删除自己的账号" in response.json()["detail"]

    def test_delete_nonexistent_user(self, client, db_session):
        """Deleting a nonexistent user returns 404."""
        _create_user(db_session, "admin1", "admin123", role="admin")

        token = _login(client, "admin1", "admin123")
        response = client.delete("/api/admin/users/99999", headers=_headers(token))
        assert response.status_code == 404


class TestAdminChangePassword:
    def test_change_password(self, client, db_session):
        """Admin can change their password."""
        _create_user(db_session, "admin1", "admin123", role="admin")

        token = _login(client, "admin1", "admin123")
        response = client.post(
            "/api/admin/change-password",
            json={"old_password": "admin123", "new_password": "newpass123"},
            headers=_headers(token),
        )
        assert response.status_code == 200
        assert response.json()["message"] == "密码修改成功"

        # Verify can login with new password
        new_token = _login(client, "admin1", "newpass123")
        assert new_token is not None

    def test_change_password_wrong_old_password(self, client, db_session):
        """Changing password with wrong old password fails."""
        _create_user(db_session, "admin1", "admin123", role="admin")

        token = _login(client, "admin1", "admin123")
        response = client.post(
            "/api/admin/change-password",
            json={"old_password": "wrongpassword", "new_password": "newpass123"},
            headers=_headers(token),
        )
        assert response.status_code == 400
        assert "原密码错误" in response.json()["detail"]

    def test_change_password_weak_new_password(self, client, db_session):
        """Changing password with weak new password fails."""
        _create_user(db_session, "admin1", "admin123", role="admin")

        token = _login(client, "admin1", "admin123")

        # Too short
        response = client.post(
            "/api/admin/change-password",
            json={"old_password": "admin123", "new_password": "short1"},
            headers=_headers(token),
        )
        assert response.status_code in (400, 422)  # Pydantic or custom validation

        # No digit
        response = client.post(
            "/api/admin/change-password",
            json={"old_password": "admin123", "new_password": "onlyletters"},
            headers=_headers(token),
        )
        assert response.status_code in (400, 422)

        # No letter
        response = client.post(
            "/api/admin/change-password",
            json={"old_password": "admin123", "new_password": "12345678"},
            headers=_headers(token),
        )
        assert response.status_code in (400, 422)


class TestAdminGlobalSettings:
    def test_get_global_settings(self, client, db_session):
        """Admin can get global settings."""
        _create_user(db_session, "admin1", "admin123", role="admin")

        token = _login(client, "admin1", "admin123")
        response = client.get("/api/admin/settings", headers=_headers(token))
        assert response.status_code == 200
        settings = response.json()
        assert "model_provider" in settings
        assert "model_base_url" in settings
        assert "model_name" in settings
        assert "has_api_key" in settings

    def test_update_global_settings(self, client, db_session):
        """Admin can update global settings."""
        _create_user(db_session, "admin1", "admin123", role="admin")

        token = _login(client, "admin1", "admin123")

        response = client.put(
            "/api/admin/settings",
            json={
                "model_provider": "openai-compatible",
                "model_base_url": "https://api.example.com/v1",
                "model_name": "gpt-4",
                "model_api_key": "test-key-123",
            },
            headers=_headers(token),
        )
        assert response.status_code == 200
        settings = response.json()
        assert settings["model_provider"] == "openai-compatible"
        assert settings["model_base_url"] == "https://api.example.com/v1"
        assert settings["model_name"] == "gpt-4"
        assert settings["has_api_key"] is True

    def test_get_settings_requires_admin(self, client, db_session):
        """Non-admin users cannot get global settings."""
        _create_user(db_session, "user1", "password123")

        token = _login(client, "user1", "password123")
        response = client.get("/api/admin/settings", headers=_headers(token))
        assert response.status_code == 403

    def test_update_settings_requires_admin(self, client, db_session):
        """Non-admin users cannot update global settings."""
        _create_user(db_session, "user1", "password123")

        token = _login(client, "user1", "password123")
        response = client.put(
            "/api/admin/settings",
            json={"model_provider": "openai-compatible"},
            headers=_headers(token),
        )
        assert response.status_code == 403
