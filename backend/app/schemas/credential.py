from pydantic import BaseModel


class CredentialCreate(BaseModel):
    name: str
    type: str  # snmp_v2c, snmp_v3, ssh
    username: str | None = None
    password: str | None = None
    community_string: str | None = None


class CredentialUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    username: str | None = None
    password: str | None = None
    community_string: str | None = None


class CredentialOut(BaseModel):
    id: int
    name: str
    type: str
    username: str | None = None

    model_config = {"from_attributes": True}
