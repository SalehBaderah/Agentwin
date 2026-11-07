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
    session_registration: bool = False
    readings: dict[str, float | bool | str | None]

class Mapping(Strict):
    field: str = Field(default='sensor_value', pattern=r'^[a-z][a-z0-9_]{0,39}$')
    unit: str = Field(default='value', min_length=1, max_length=20)

class DeviceCreate(Strict):
    device_id: str = Field(pattern=r'^[a-z0-9-]{1,64}$')
    connector: Literal['usb', 'mqtt']
    serial_port: str | None = Field(default=None, max_length=80)
    baud_rate: int = Field(default=115200, ge=1200, le=2000000)

class ComponentCreate(Strict):
    component_id: str = Field(pattern=r'^[a-z][a-z0-9-]{0,63}$')
    component_type: Literal['controller', 'led', 'temperature', 'humidity', 'analog', 'readonly']
    label: str = Field(min_length=1, max_length=100)
    device_id: str = Field(pattern=r'^[a-z0-9-]{1,64}$')
    pin: str | None = Field(default=None, max_length=20)
    field_key: str | None = Field(default=None, pattern=r'^[a-z][a-z0-9_]{0,39}$')
    field_type: Literal['number', 'boolean', 'categorical'] = 'number'
    unit: str = Field(default='', max_length=20)
    precision: int = Field(default=2, ge=0, le=8)
    freshness_seconds: int | None = Field(default=None, ge=3, le=3600)

class ThresholdRule(Strict):
    field_key: str = Field(pattern=r'^[a-z][a-z0-9_]{0,39}$')
    direction: Literal['above', 'below']
    limit: float

class MonitoringSettings(Strict):
    silence_seconds: int = Field(default=30, ge=3, le=86400)
    threshold_rules: list[ThresholdRule] = Field(default_factory=list, max_length=32)
    summary_enabled: bool = True
    summary_interval_minutes: int = Field(default=10, ge=1, le=1440)
    alert_email_enabled: bool = True
    summary_email_enabled: bool = True
    email_to: str | None = Field(default=None, max_length=254, pattern=r'^[^@\s,<>]+@[^@\s,<>]+\.[^@\s,<>]+$')

    @model_validator(mode='after')
    def distinct_rules(self):
        keys = [(rule.field_key, rule.direction) for rule in self.threshold_rules]
        if len(keys) != len(set(keys)):
            raise ValueError('Threshold rules must have unique field and direction')
        return self

class ProjectCreate(Strict):
    name: str = Field(min_length=1, max_length=100)
    template: str = Field(default='generic', pattern=r'^[a-z][a-z0-9_-]{0,63}$')
    device_id: str = Field(default='device-01', pattern=r'^[a-z0-9-]{1,64}$')
    connector: Literal['usb', 'mqtt'] = 'usb'
    serial_port: str | None = Field(default=None, max_length=80)
    baud_rate: int = Field(default=115200, ge=1200, le=2000000)
    mapping: Mapping = Field(default_factory=Mapping)
    freshness_seconds: int = Field(default=8, ge=3, le=3600)
    interval_seconds: int = Field(default=1, ge=1, le=600)
    high_limit: float | None = None
    cable_description: str = Field(default='Configured connection', max_length=300)
    devices: list[DeviceCreate] = Field(default_factory=list, max_length=16)
    components: list[ComponentCreate] = Field(default_factory=list, max_length=64)
    retention_days: int = Field(default=30, ge=1, le=3650)
    monitoring: MonitoringSettings = Field(default_factory=MonitoringSettings)
    @model_validator(mode='before')
    @classmethod
    def hardware_defaults(cls, data):
        if not isinstance(data, dict): return data
        template = data.get('template', 'generic')
        if not isinstance(template, str): return data
        if template in ('led', 'temperature', 'water', 'connectivity', 'generic'): return data
        from .hardware_templates import get_template
        spec = get_template(template)
        data = dict(data)
        for key in ('device_id', 'connector', 'baud_rate', 'interval_seconds', 'freshness_seconds'):
            data.setdefault(key, spec['defaults'][key])
        data.setdefault('components', [{**item, 'device_id': data['device_id'], 'freshness_seconds': data['freshness_seconds']} for item in spec['components']])
        data.setdefault('mapping', {'field': spec['components'][0]['field_key'], 'unit': spec['components'][0]['unit'] or 'state'})
        return data
    @model_validator(mode='after')
    def intervals(self):
        if self.freshness_seconds < self.interval_seconds * 2: raise ValueError('Freshness must be at least twice the sampling interval')
        device_ids = [self.device_id, *(device.device_id for device in self.devices)]
        if len(device_ids) != len(set(device_ids)): raise ValueError('Device identities must be unique within a project')
        if any(component.device_id not in device_ids for component in self.components): raise ValueError('Every component must map to a registered device')
        component_ids = [component.component_id for component in self.components]
        if len(component_ids) != len(set(component_ids)): raise ValueError('Component identities must be unique')
        field_keys = [component.field_key for component in self.components if component.field_key]
        if len(field_keys) != len(set(field_keys)): raise ValueError('Field keys must be unique')
        return self

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
    control_request: ComponentAction | None = None

class Settings(Strict):
    freshness_seconds: int = Field(ge=3, le=3600)
    high_limit: float | None = None
    cable_description: str = Field(max_length=300)
    monitoring: MonitoringSettings | None = None
