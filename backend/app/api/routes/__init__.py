from app.api.routes import auth, health, model_settings

routers = [health.router, auth.router, model_settings.router]
