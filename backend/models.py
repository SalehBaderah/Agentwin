from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, strict=True)

class Telemetry(Strict):
    schema_version: Literal[1]
    project_id: str = Field(pattern=r'^[a-z0-9-]{1,64}$')
    device_id: str = Field(pattern=r'^[a-z0-9-]{1,64}$')
    boot_id: str = Field(min_length=1, max_length=80)
    sequence: int = Field(ge=0)
    uptime_ms: int = Field(ge=0)
    readings: dict[str, float | bool | str | None]

class Mapping(Strict):
    field: str = Field(default='sensor_value', pattern=r'^[a-z][a-z0-9_]{0,39}$')
    unit: str = Field(default='value', min_length=1, max_length=20)

class ProjectCreate(Strict):
    name: str = Field(min_length=1, max_length=100)
    template: Literal['led', 'temperature', 'water', 'connectivity', 'generic'] = 'generic'
    device_id: str = Field(default='device-01', pattern=r'^[a-z0-9-]{1,64}$')
    connector: Literal['usb', 'mqtt'] = 'usb'
    serial_port: str | None = Field(default=None, max_length=80)
    mapping: Mapping = Field(default_factory=Mapping)
    freshness_seconds: int = Field(default=8, ge=3, le=3600)
    interval_seconds: int = Field(default=1, ge=1, le=600)
    high_limit: float | None = None
    cable_description: str = Field(default='Configured connection', max_length=300)
    @model_validator(mode='after')
    def intervals(self):
        if self.freshness_seconds < self.interval_seconds * 2: raise ValueError('Freshness must be at least twice the sampling interval')
        return self

class DeviceCreate(Strict):
    device_id: str = Field(pattern=r'^[a-z0-9-]{1,64}$')
    connector: Literal['usb', 'mqtt']
    serial_port: str | None = Field(default=None, max_length=80)

class ComponentAction(Strict):
    component_id: str = Field(pattern=r'^[a-z0-9-]{1,64}$')
    action: str = Field(pattern=r'^[a-z][a-z0-9_]{1,40}$')
    value: bool | float | int | str

class SessionCreate(Strict):
    mode: Literal['live', 'simulated']

class Scenario(Strict):
    scenario: Literal['normal', 'level-change', 'pause', 'recovery', 'stop']

class Question(Strict):
    question: str = Field(min_length=1, max_length=2000)
    component_id: str | None = Field(default=None, pattern=r'^[a-z0-9-]{1,64}$')

class Settings(Strict):
    freshness_seconds: int = Field(ge=3, le=3600)
    high_limit: float | None = None
    cable_description: str = Field(max_length=300)
