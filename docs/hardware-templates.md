# Hardware Templates and per-device firmware packages

Choose supported hardware, configure the device, deploy its Agentwin firmware
package, and bring it into the same operational workspace.

Agentwin includes two Hardware Templates:

| Template | Hardware/transport | Firmware |
| --- | --- | --- |
| Arduino UNO D13 LED | Classic UNO, built-in D13 LED, USB at 38400 baud | `arduino_uno_d13_led` |
| R4 RF Jamming Detector | UNO R4 WiFi, A5 RF detector, supplied MLP, direct MQTT | `R4_jamming_detector` |

These Hardware Templates reuse the existing firmware and drivers. They do not discover or
verify the connected hardware. Actual wiring, calibration, output and recovery
still require physical checks.

## Create a project

1. Open **Add project**, name the project and keep **Supported hardware** selected.
   Choose the Hardware Template; the dropdown lists supported hardware only.
2. Set the device identity and, for USB, its COM port. Transport and firmware
   baud are supplied by the Hardware Template.
3. Review timing and retention. Fields, units, precision and pins are supplied
   by the Hardware Template. Their values match the existing firmware implementation.
4. Create the project. Agentwin opens its **Device setup** tab.
5. Download the firmware package after its contract check passes.

Select **Custom configuration** as the setup method for custom hardware and
multiple-device assemblies. Configure its devices, components and fields using
the editable steps; matching firmware must be supplied by the operator. Hardware
Templates currently create one device per project. Legacy custom presets are no
longer options in the Hardware Template dropdown.

## Use the downloaded package

Extract the ZIP into a separate folder for that device. It includes a copy of
the sketch/driver/model, its required shared Agentwin libraries, generated
`project_config.h`, `setup.json`, PowerShell scripts, hardware documentation
and suggested broker ACL rules. Original source/configuration and existing
platform projects are not overwritten.

For R4, copy the example to `secrets.h` and fill the credentials locally. The
exporter never reads existing `secrets.h`, `.env`, or broker password files.
Use a broker address reachable from the device, not the device's localhost.
Review and merge ACL rules; create/update the MQTT account separately.

Install the board core and external libraries from `sketch.yaml`. Build:

```powershell
.\build.ps1 -ArduinoCli "C:\path\to\arduino-cli.exe"
.\upload.ps1 -Port COM4 -ArduinoCli "C:\path\to\arduino-cli.exe"
```

The upload script requires an explicit port. Stop the board's gateway and close
Serial Monitor before uploading. For the UNO, restart the gateway using the
included script (from the extracted package directory):

```powershell
.\start-gateway.ps1 -AgentwinRoot E:\SALEH\GITHUB\Agentwin -Port COM4
```

R4 uses direct MQTT and does not need a serial gateway. Confirm increasing Live
readings in the correct project, disconnect/stale/recovery behavior, and the
existing telemetry-confirmed command path for the UNO LED. Compilation alone
does not establish physical operation.

## Existing projects

Open **Device setup**, select the registered device and the Hardware Template.
The check compares that device's saved fields, types, units, pins, transport and
LED confirmation contract. An incompatible package cannot be downloaded.
This selection does not change the project or identify the board. Older UNO
projects may store 115200 as a generic baud default; the UI explains that the
actual firmware and exported gateway use 38400, without rewriting the project.

## Setup progress and evidence

**Configured → Firmware downloaded → Upload confirmed → Reporting → Telemetry
verified** is visible in Device setup for the selected device and Hardware Template.

- **Configured**: device exists in the saved project.
- **Firmware downloaded**: the complete package reached this browser and a download
  was initiated; Agentwin cannot confirm the file was saved to disk.
- **Upload confirmed**: the operator selects **I uploaded this package** after uploading
  locally. This is an explicit confirmation, not observed hardware evidence.
- **Reporting**: fresh, correctly typed measurements from this device in the
  selected **Live** session. Simulation/Replay never complete this stage.
- **Telemetry verified**: compatible configuration and two fresh, complete Live samples
  from the same boot with increasing sequence and receipt time. This verifies
  the telemetry contract, not firmware identity, calibration, physical wiring
  or output. Hardware remains **Not independently verified**.

Each stage has a short explanation. The header reflects the latest confirmed
evidence, while the stepper highlights the first unfinished stage. Only when
all five stages have evidence does the stepper collapse into a compact
**Telemetry verified** badge. Select **View setup progress** to expand it.
Stale telemetry, a backend disconnect or a non-Live session automatically
restores the full stepper.

Download/upload records are local to this browser, project, device, template
version and configuration. Downloading a new package clears the upload
confirmation; changing configuration invalidates previous records. Reporting
and verification are computed from current telemetry, expire with freshness,
and never persist as operator checkboxes. Existing reporting devices can show
telemetry progress without a download/upload record in this browser; those
earlier operator actions are never inferred from telemetry.

## Digital Twin artwork

A Hardware Template's optional `visual_profile` supplies the configured default
2D board artwork for newly created projects. Board/FQBN, components, pins and
transport remain configured metadata, never automatic hardware identification.
Unknown profile IDs fall back to generic artwork with an explanation.

Physical 2D retains **Artwork profile · this browser** overrides and **Use
configured/default**. Existing projects are not migrated automatically. Device
setup offers **Use suggested artwork in this browser** after compatibility
passes; this only saves the visual preference for that project/device.
Configured wiring remains the default truth and artwork is not verified wiring.

## Add another Hardware Template

1. Implement the hardware driver and thin sketch in `firmware/projects/` using
   the existing Agentwin libraries. Keep the sketch folder and main `.ino` name
   identical. Sensor drivers implement `begin()` and `appendReadings()`;
   implemented actuators also validate and apply supported commands.
2. Create a JSON manifest in `firmware/templates/`. Copy one of the existing
   manifests as a format reference. Supply a unique string ID, version, name,
   board/FQBN, optional `visual_profile` ID, firmware source directory, an explicit public-file allowlist,
   shared library names, defaults, exact component/field contracts and notes.
3. Add the referenced `.h.tpl` configuration template in the same directory.
   Available substitutions: `$project_id`, `$device_id`, `$interval_ms`,
   `$led_component_id` and `$ack_field`. Put fixed hardware/model settings in
   this template; new hardware behavior still belongs in the driver.
4. Compile and physically validate the intended setup. Add package/contract
   tests. An arbitrary new actuator still needs platform capability support;
   adding a manifest does not implement a command handler or safety rules.
5. Restart the backend to reload the manifest registry. The new Hardware Template appears
   automatically in Add Project and Device setup; no frontend name list or
   ProjectCreate template literal needs editing.

`backend/hardware_templates.py` loads manifests and exports packages;
`/api/project-templates` supplies UI defaults. The five legacy custom configurations
continue to be derived from the existing backend component definitions for
compatibility; they are not offered as Hardware Templates. The custom setup
method starts with the generic editable configuration.
For Hardware Templates, generated firmware cannot publish additional undeclared
fields, invent pins or modify the RF model/calibration behavior.

## API

- `GET /api/project-templates`
- `GET /api/projects/{id}/devices/{device}/setup` (existing contract)
- `GET /api/projects/{id}/devices/{device}/firmware-check?template_id=...`
- `GET /api/projects/{id}/devices/{device}/firmware.zip?template_id=...`

Exports and checks operate on one registered project/device. They do not ingest
telemetry, change sessions, execute commands, provision credentials, modify ACLs,
or flash a board. Each generated package records its template version.

Internal implementation terminology: a recipe is the configuration/firmware
assembly implemented by a JSON manifest. The user-facing name is Hardware Template.
