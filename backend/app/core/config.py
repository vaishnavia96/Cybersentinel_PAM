from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/nms_db"
    APP_NAME: str = "NMS API Core"
    SECRET_KEY: str = "nms-dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    REDIS_URL: str = "redis://localhost:6379"
    POLL_INTERVAL_SECONDS: int = 60
    FERNET_KEY: str = "CHANGE_ME_GENERATE_WITH_Fernet.generate_key()"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
