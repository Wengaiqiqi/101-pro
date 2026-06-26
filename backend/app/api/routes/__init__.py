from app.api.routes import auth, health, import_jobs, model_settings, question_banks, questions

routers = [
    health.router,
    auth.router,
    model_settings.router,
    question_banks.router,
    questions.router,
    import_jobs.router,
]
