from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

Identifier = str

class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, strict=True)

class Telemetry(Strict):
    schema_version: Literal[1]
    project_id: str = Field(pattern=r'^[a-z0-9-]{1,64}$')
    device_id: str = Field(pattern=r'^[a-z0-9-]{1,64}$')
    boot_id: str = Field(min_length=1, max_length=80)
    sequence: int = Field(ge=0, strict=True)
    uptime_ms: int = Field(ge=0, strict=True)
    readings: dict[str, float | bool | str | None]

class Mapping(Strict):
    field: str = Field(default='sensor_value', pattern=r'^[a-z][a-z0-9_]{0,39}$')
    unit: str = Field(default='°C', min_length=1, max_length=20)

class ProjectCreate(Strict):
    name: str = Field(min_length=1, max_length=100)
    template: Literal['led'] = 'led'
    device_id: str = Field(default='sensor-01', pattern=r'^[a-z0-9-]{1,64}$')
    connector: Literal['usb', 'mqtt'] = 'usb'
    mapping: Mapping = Field(default_factory=Mapping)
    freshness_seconds: int = Field(default=8, ge=3, le=3600)
    interval_seconds: int = Field(default=1, ge=1, le=600)
    high_limit: float = 1.6
    attenuator_inserted: bool = False
    cable_description: str = Field(default='SMA cable; verify actual arrangement', max_length=300)

    @model_validator(mode='after')
    def intervals(self):
        if self.freshness_seconds < self.interval_seconds * 2:
            raise ValueError('Freshness must be at least twice the sampling interval')
        return self

class ComponentAction(Strict):
    component_id: str = Field(pattern=r'^[a-z0-9-]{1,64}$')
    action: Literal['set_led']
    value: bool

class Question(Strict):
    question: str = Field(min_length=1, max_length=2000)
    component_id: str | None = Field(default=None, pattern=r'^[a-z0-9-]{1,64}$')

class Settings(Strict):
    freshness_seconds: int = Field(ge=3, le=3600)
    high_limit: float
    attenuator_inserted: bool
    cable_description: str = Field(max_length=300)
