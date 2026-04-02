from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    database_url: str
    frontend_origin: str | None = None
    frontend_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    red_threshold_seconds: int = 15 * 60

    @property
    def cors_origins(self) -> list[str]:
        parsed = [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]
        if self.frontend_origin and self.frontend_origin not in parsed:
            parsed.append(self.frontend_origin)
        return parsed


settings = Settings()