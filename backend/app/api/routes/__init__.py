from app.api.routes import admin, auth, health, import_jobs, model_settings, practice, question_banks, questions

routers = [
    health.router,
    auth.router,
    admin.router,
    model_settings.router,
    question_banks.router,
    questions.router,
    import_jobs.router,
    practice.router,
]
