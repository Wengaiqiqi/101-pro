import sys
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.services import model_settings_service
from tests.conftest import register_and_login


def test_model_settings_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/model-settings")

    assert response.status_code in {401, 403}


def test_model_settings_save_get_and_test_prioritizes_user_config(
    client: TestClient,
    monkeypatch,
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "model_api_key", "platform-key")

    token = register_and_login(client, "alice", "alice@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    initial_response = client.get("/api/model-settings", headers=headers)
    assert initial_response.status_code == 200
    initial = initial_response.json()
    assert initial["has_api_key"] is False
    assert initial["platform_available"] is True
    assert "api_key" not in initial

    saved_response = client.put(
        "/api/model-settings",
        headers=headers,
        json={
            "provider": "openai-compatible",
            "base_url": "https://user.example/v1",
            "model": "user-model",
            "api_key": "user-secret-key",
        },
    )
    assert saved_response.status_code == 200
    saved = saved_response.json()
    assert saved["provider"] == "openai-compatible"
    assert saved["base_url"] == "https://user.example/v1"
    assert saved["model"] == "user-model"
    assert saved["has_api_key"] is True
    assert "api_key" not in saved

    fetched_response = client.get("/api/model-settings", headers=headers)
    assert fetched_response.status_code == 200
    fetched = fetched_response.json()
    assert fetched["provider"] == "openai-compatible"
    assert fetched["base_url"] == "https://user.example/v1"
    assert fetched["model"] == "user-model"
    assert fetched["has_api_key"] is True
    assert "api_key" not in fetched

    updated_response = client.put(
        "/api/model-settings",
        headers=headers,
        json={
            "provider": "openai-compatible",
            "base_url": "https://user.example/v2",
            "model": "user-model-v2",
        },
    )
    assert updated_response.status_code == 200
    updated = updated_response.json()
    assert updated["base_url"] == "https://user.example/v2"
    assert updated["model"] == "user-model-v2"
    assert updated["has_api_key"] is True
    assert "api_key" not in updated

    observed_config = {}

    def fake_test_model_connection(config: model_settings_service.ResolvedModelConfig) -> dict[str, object]:
        observed_config["provider"] = config.provider
        observed_config["base_url"] = config.base_url
        observed_config["model"] = config.model
        observed_config["api_key"] = config.api_key
        return {"ok": True, "provider": config.provider, "model": config.model}

    monkeypatch.setattr(model_settings_service, "test_model_connection", fake_test_model_connection)

    test_response = client.post("/api/model-settings/test", headers=headers)
    assert test_response.status_code == 200
    assert test_response.json() == {"ok": True, "provider": "openai-compatible", "model": "user-model-v2"}
    assert observed_config == {
        "provider": "openai-compatible",
        "base_url": "https://user.example/v2",
        "model": "user-model-v2",
        "api_key": "user-secret-key",
    }


def test_model_settings_requires_key_on_first_save(client: TestClient) -> None:
    token = register_and_login(client, "alice", "alice@example.com")
    response = client.put(
        "/api/model-settings",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "provider": "openai-compatible",
            "base_url": "https://user.example/v1",
            "model": "user-model",
        },
    )

    assert response.status_code == 400


def test_model_connection_returns_stable_failure(monkeypatch) -> None:
    class FakeHTTPError(Exception):
        pass

    def fake_post(*args, **kwargs):
        raise FakeHTTPError("timeout")

    fake_httpx = SimpleNamespace(
        HTTPError=FakeHTTPError,
        HTTPStatusError=type("FakeHTTPStatusError", (FakeHTTPError,), {}),
        post=fake_post,
    )
    monkeypatch.setitem(sys.modules, "httpx", fake_httpx)

    response = model_settings_service.test_model_connection(
        model_settings_service.ResolvedModelConfig(
            provider="openai-compatible",
            base_url="https://provider.example/v1",
            model="demo-model",
            api_key="secret",
        )
    )

    assert response == {
        "ok": False,
        "provider": "openai-compatible",
        "model": "demo-model",
        "message": "Could not connect to model provider",
    }
