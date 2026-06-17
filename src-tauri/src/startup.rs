use crate::{AppResult, FreshStartError};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum StartupSource {
    Registry,
    StartupFolder,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RiskLevel {
    Normal,
    Keep,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupItem {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_name: Option<String>,
    pub source: StartupSource,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_path: Option<String>,
    pub risk_level: RiskLevel,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risk_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disabled_at: Option<String>,
    #[serde(default)]
    pub remembered: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "source", rename_all = "kebab-case", rename_all_fields = "camelCase")]
enum DisabledRecord {
    Registry {
        id: String,
        name: String,
        value_name: String,
        command: String,
        disabled_at: String,
    },
    StartupFolder {
        id: String,
        name: String,
        original_path: String,
        backup_path: String,
        disabled_at: String,
    },
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FreshStartState {
    disabled: Vec<DisabledRecord>,
}

#[derive(Debug, Clone)]
struct StartupRecord {
    id: String,
    source: StartupSource,
    name: String,
    raw_name: Option<String>,
    value_name: Option<String>,
    command: Option<String>,
    original_path: Option<String>,
    backup_path: Option<String>,
    app_path: Option<String>,
    disabled_at: Option<String>,
    last_seen_at: Option<String>,
}

pub fn list_startup_items() -> AppResult<Vec<StartupItem>> {
    let conn = open_db()?;
    migrate_state_json(&conn)?;

    let now = Utc::now().to_rfc3339();
    let active = scan_active_items()?;
    for item in &active {
        upsert_seen_item(&conn, item, &now)?;
    }

    let active_by_id: HashMap<String, StartupItem> = active
        .into_iter()
        .map(|item| (item.id.clone(), item))
        .collect();
    let records = load_records(&conn)?;
    let active_ids: HashSet<String> = active_by_id.keys().cloned().collect();
    let mut merged = Vec::new();

    for record in records {
        if let Some(active_item) = active_by_id.get(&record.id) {
            merged.push(enrich_active_item(active_item.clone(), &record));
        } else if record.command.is_some() || record.original_path.is_some() || record.disabled_at.is_some() {
            merged.push(record_to_disabled_item(&record));
        }
    }

    for (id, item) in active_by_id {
        if !active_ids.contains(&id) {
            merged.push(item);
        }
    }

    merged.sort_by(|a, b| b.enabled.cmp(&a.enabled).then_with(|| a.name.cmp(&b.name)));
    Ok(merged)
}

pub fn set_startup_enabled(id: &str, enabled: bool, expected_command: Option<&str>) -> AppResult<()> {
    if enabled {
        restore_startup_item(id)
    } else if let Some(value_name) = id.strip_prefix("registry:") {
        disable_registry_item(
            id,
            registry_key_path_for_id(id),
            value_name,
            expected_command,
        )
    } else if let Some(value_name) = id.strip_prefix("registry32:") {
        disable_registry_item(
            id,
            registry_key_path_for_id(id),
            value_name,
            expected_command,
        )
    } else if let Some(file_name) = id.strip_prefix("startup-folder:") {
        disable_startup_folder_item(id, file_name, expected_command)
    } else {
        Err(message("未知启动项 ID"))
    }
}

fn disable_registry_item(
    id: &str,
    key_path: &str,
    value_name: &str,
    expected_command: Option<&str>,
) -> AppResult<()> {
    let command = read_registry_value_at(key_path, value_name)?;
    if let Some(expected) = expected_command {
        if expected != command {
            return Err(message("启动项已变化，请刷新后重试"));
        }
    }

    let now = Utc::now().to_rfc3339();
    let app_path = executable_path_from_command(&command);
    let name = friendly_app_name(value_name, Some(&command), app_path.as_deref());
    let item = StartupItem {
        id: id.to_string(),
        name,
        raw_name: Some(value_name.to_string()),
        source: StartupSource::Registry,
        enabled: true,
        command: Some(command.clone()),
        path: None,
        app_path,
        risk_level: RiskLevel::Normal,
        risk_reason: None,
        disabled_at: None,
        remembered: false,
    };

    let conn = open_db()?;
    upsert_seen_item(&conn, &item, &now)?;
    delete_registry_value_at(key_path, value_name)?;
    if registry_value_exists_at(key_path, value_name)? {
        return Err(message("注册表启动项删除后仍然存在，请刷新后重试"));
    }
    mark_disabled(&conn, id, Some(&command), None, None, &now)?;
    Ok(())
}

fn disable_startup_folder_item(id: &str, file_name: &str, expected_command: Option<&str>) -> AppResult<()> {
    let startup_dir = startup_folder_dir()?;
    let original_path = startup_dir.join(file_name);
    if !original_path.exists() {
        return Err(message("启动文件夹快捷方式不存在，请刷新后重试"));
    }

    let original_string = original_path.to_string_lossy().to_string();
    if let Some(expected) = expected_command {
        if expected != original_string {
            return Err(message("启动文件夹项已变化，请刷新后重试"));
        }
    }

    let now = Utc::now().to_rfc3339();
    let disabled_dir = disabled_dir()?;
    fs::create_dir_all(&disabled_dir)?;
    let backup_path = unique_backup_path(&disabled_dir, file_name);
    let backup_string = backup_path.to_string_lossy().to_string();
    let name = display_name(file_name);
    let item = StartupItem {
        id: id.to_string(),
        name,
        raw_name: Some(file_name.to_string()),
        source: StartupSource::StartupFolder,
        enabled: true,
        command: Some(original_string.clone()),
        path: Some(original_string.clone()),
        app_path: Some(original_string.clone()),
        risk_level: RiskLevel::Normal,
        risk_reason: None,
        disabled_at: None,
        remembered: false,
    };

    let conn = open_db()?;
    upsert_seen_item(&conn, &item, &now)?;
    fs::rename(&original_path, &backup_path)?;
    mark_disabled(
        &conn,
        id,
        Some(&original_string),
        Some(&original_string),
        Some(&backup_string),
        &now,
    )?;
    Ok(())
}

fn restore_startup_item(id: &str) -> AppResult<()> {
    let conn = open_db()?;
    let record = load_record(&conn, id)?.ok_or_else(|| message("没有找到可恢复记录，请刷新后重试"))?;

    match record.source {
        StartupSource::Registry => {
            let value_name = record
                .value_name
                .as_deref()
                .ok_or_else(|| message("缺少注册表值名，无法恢复"))?;
            let command = record
                .command
                .as_deref()
                .ok_or_else(|| message("缺少原始启动命令，无法恢复"))?;
            let key_path = registry_key_path_for_id(id);
            if registry_value_exists_at(key_path, value_name)? {
                return Err(message("同名注册表启动项已存在，已拒绝覆盖"));
            }
            write_registry_value_at(key_path, value_name, command)?;
        }
        StartupSource::StartupFolder => {
            let original = record
                .original_path
                .as_deref()
                .map(PathBuf::from)
                .ok_or_else(|| message("缺少原始快捷方式路径，无法恢复"))?;
            let backup = record
                .backup_path
                .as_deref()
                .map(PathBuf::from)
                .ok_or_else(|| message("缺少备份快捷方式路径，无法恢复"))?;
            if original.exists() {
                return Err(message("Startup 文件夹同名快捷方式已存在，已拒绝覆盖"));
            }
            if !backup.exists() {
                return Err(message("备份快捷方式不存在，无法恢复"));
            }
            if let Some(parent) = original.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::rename(backup, original)?;
        }
    }

    clear_disabled(&conn, id)?;
    Ok(())
}

fn open_db() -> AppResult<Connection> {
    let path = db_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(path)?;
    ensure_schema(&conn)?;
    Ok(conn)
}

fn ensure_schema(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS startup_records (
            id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            name TEXT NOT NULL,
            raw_name TEXT,
            value_name TEXT,
            command TEXT,
            original_path TEXT,
            backup_path TEXT,
            app_path TEXT,
            disabled_at TEXT,
            last_seen_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        ",
    )?;
    ensure_column(conn, "component_name", "TEXT")?;
    Ok(())
}

fn ensure_column(conn: &Connection, column: &str, definition: &str) -> AppResult<()> {
    let mut stmt = conn.prepare("PRAGMA table_info(startup_records)")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for row in rows {
        if row? == column {
            return Ok(());
        }
    }
    conn.execute(&format!("ALTER TABLE startup_records ADD COLUMN {column} {definition}"), [])?;
    Ok(())
}

fn upsert_seen_item(conn: &Connection, item: &StartupItem, now: &str) -> AppResult<()> {
    let source = source_to_str(&item.source);
    conn.execute(
        "
        INSERT INTO startup_records (
            id, source, name, raw_name, value_name, command, original_path, app_path,
            last_seen_at, created_at, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?9)
        ON CONFLICT(id) DO UPDATE SET
            source = excluded.source,
            name = excluded.name,
            raw_name = COALESCE(excluded.raw_name, startup_records.raw_name),
            value_name = COALESCE(excluded.value_name, startup_records.value_name),
            command = COALESCE(excluded.command, startup_records.command),
            original_path = COALESCE(excluded.original_path, startup_records.original_path),
            app_path = COALESCE(excluded.app_path, startup_records.app_path),
            last_seen_at = excluded.last_seen_at,
            updated_at = excluded.updated_at
        ",
        params![
            item.id,
            source,
            item.name,
            item.raw_name,
            item.raw_name,
            item.command,
            item.path,
            item.app_path,
            now,
        ],
    )?;
    Ok(())
}

fn mark_disabled(
    conn: &Connection,
    id: &str,
    command: Option<&str>,
    original_path: Option<&str>,
    backup_path: Option<&str>,
    now: &str,
) -> AppResult<()> {
    conn.execute(
        "
        UPDATE startup_records
        SET disabled_at = ?2,
            command = COALESCE(?3, command),
            original_path = COALESCE(?4, original_path),
            backup_path = COALESCE(?5, backup_path),
            updated_at = ?2
        WHERE id = ?1
        ",
        params![id, now, command, original_path, backup_path],
    )?;
    Ok(())
}

fn clear_disabled(conn: &Connection, id: &str) -> AppResult<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE startup_records SET disabled_at = NULL, backup_path = NULL, updated_at = ?2 WHERE id = ?1",
        params![id, now],
    )?;
    Ok(())
}

fn load_records(conn: &Connection) -> AppResult<Vec<StartupRecord>> {
    let mut stmt = conn.prepare(
        "
        SELECT id, source, name, raw_name, value_name, command, original_path,
               backup_path, app_path, disabled_at, last_seen_at
        FROM startup_records
        ORDER BY name COLLATE NOCASE
        ",
    )?;
    let rows = stmt.query_map([], row_to_record)?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn load_record(conn: &Connection, id: &str) -> AppResult<Option<StartupRecord>> {
    conn.query_row(
        "
        SELECT id, source, name, raw_name, value_name, command, original_path,
               backup_path, app_path, disabled_at, last_seen_at
        FROM startup_records
        WHERE id = ?1
        ",
        params![id],
        row_to_record,
    )
    .optional()
    .map_err(Into::into)
}

fn row_to_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<StartupRecord> {
    Ok(StartupRecord {
        id: row.get(0)?,
        source: str_to_source(row.get::<_, String>(1)?.as_str()),
        name: row.get(2)?,
        raw_name: row.get(3)?,
        value_name: row.get(4)?,
        command: row.get(5)?,
        original_path: row.get(6)?,
        backup_path: row.get(7)?,
        app_path: row.get(8)?,
        disabled_at: row.get(9)?,
        last_seen_at: row.get(10)?,
    })
}

fn enrich_active_item(mut item: StartupItem, record: &StartupRecord) -> StartupItem {
    item.name = record.name.clone();
    item.raw_name = record.raw_name.clone().or(item.raw_name);
    item.disabled_at = None;
    item.remembered = record.last_seen_at.is_some();
    if item.app_path.is_none() {
        item.app_path = record.app_path.clone();
    }
    let (risk_level, risk_reason) = classify_risk(&item.name, item.command.as_deref().or(item.path.as_deref()));
    item.risk_level = risk_level;
    item.risk_reason = risk_reason;
    item
}

fn record_to_disabled_item(record: &StartupRecord) -> StartupItem {
    let command = record.command.clone().or_else(|| record.original_path.clone());
    let raw_name = record.raw_name.as_deref().unwrap_or(&record.name);
    let name = friendly_app_name(raw_name, command.as_deref(), record.app_path.as_deref());
    let (risk_level, risk_reason) = classify_risk(&record.name, command.as_deref());
    StartupItem {
        id: record.id.clone(),
        name,
        raw_name: record.raw_name.clone(),
        source: record.source.clone(),
        enabled: false,
        command,
        path: record.original_path.clone(),
        app_path: record.app_path.clone(),
        risk_level,
        risk_reason,
        disabled_at: record.disabled_at.clone(),
        remembered: true,
    }
}

fn migrate_state_json(conn: &Connection) -> AppResult<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM startup_records", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }

    let path = state_path()?;
    if !path.exists() {
        return Ok(());
    }

    let text = fs::read_to_string(path)?;
    if text.trim().is_empty() {
        return Ok(());
    }
    let state: FreshStartState = serde_json::from_str(&text)?;
    let now = Utc::now().to_rfc3339();
    for record in state.disabled {
        insert_legacy_record(conn, &record, &now)?;
    }
    Ok(())
}

fn insert_legacy_record(conn: &Connection, record: &DisabledRecord, now: &str) -> AppResult<()> {
    match record {
        DisabledRecord::Registry {
            id,
            name,
            value_name,
            command,
            disabled_at,
        } => {
            let app_path = executable_path_from_command(command);
            let friendly_name = friendly_app_name(name, Some(command), app_path.as_deref());
            conn.execute(
                "
                INSERT OR IGNORE INTO startup_records (
                    id, source, name, raw_name, value_name, command, app_path,
                    disabled_at, created_at, updated_at
                )
                VALUES (?1, 'registry', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
                ",
                params![id, friendly_name, name, value_name, command, app_path, disabled_at, now],
            )?;
        }
        DisabledRecord::StartupFolder {
            id,
            name,
            original_path,
            backup_path,
            disabled_at,
        } => {
            conn.execute(
                "
                INSERT OR IGNORE INTO startup_records (
                    id, source, name, raw_name, command, original_path, backup_path, app_path,
                    disabled_at, created_at, updated_at
                )
                VALUES (?1, 'startup-folder', ?2, ?3, ?4, ?4, ?5, ?4, ?6, ?7, ?7)
                ",
                params![id, name, name, original_path, backup_path, disabled_at, now],
            )?;
        }
    }
    Ok(())
}

fn db_path() -> AppResult<PathBuf> {
    Ok(app_dir()?.join("freshstart.sqlite"))
}

fn state_path() -> AppResult<PathBuf> {
    Ok(app_dir()?.join("state.json"))
}

fn disabled_dir() -> AppResult<PathBuf> {
    Ok(app_dir()?.join("disabled"))
}

fn app_dir() -> AppResult<PathBuf> {
    let base = dirs::data_dir().ok_or_else(|| message("无法定位当前用户 AppData 目录"))?;
    Ok(base.join("FreshStart"))
}

fn startup_folder_dir() -> AppResult<PathBuf> {
    let base = dirs::config_dir().ok_or_else(|| message("无法定位当前用户 Roaming AppData 目录"))?;
    Ok(base
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
        .join("Startup"))
}

fn unique_backup_path(disabled_dir: &Path, file_name: &str) -> PathBuf {
    let mut candidate = disabled_dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }

    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("startup-item");
    let ext = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("lnk");

    for index in 1..1000 {
        candidate = disabled_dir.join(format!("{stem}-{index}.{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }

    disabled_dir.join(format!("{stem}-{}.{}", Utc::now().timestamp_millis(), ext))
}

fn display_name(file_name: &str) -> String {
    Path::new(file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(file_name)
        .to_string()
}

fn friendly_app_name(raw_name: &str, command: Option<&str>, app_path: Option<&str>) -> String {
    if let Some(name) = known_app_name(raw_name, command, app_path) {
        return name;
    }

    if let Some(path) = app_path {
        if let Some(name) = version_display_name(path) {
            return clean_app_name(&name);
        }
        if let Some(stem) = Path::new(path).file_stem().and_then(|value| value.to_str()) {
            return clean_app_name(stem);
        }
    }

    if let Some(command) = command {
        if let Some(path) = executable_path_from_command(command) {
            if let Some(stem) = Path::new(&path).file_stem().and_then(|value| value.to_str()) {
                return clean_app_name(stem);
            }
        }
    }

    clean_app_name(raw_name)
}

fn known_app_name(raw_name: &str, command: Option<&str>, app_path: Option<&str>) -> Option<String> {
    let haystack = [Some(raw_name), command, app_path]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
        .replace('/', "\\");

    let rules = [
        (
            "百度网盘",
            [
                "baidunetdisk",
                "baiduyun",
                "\\baidu\\",
                "yundetectservice",
                "baiduyundetect",
                "baiduyunguanjia",
            ]
            .as_slice(),
        ),
        (
            "微信",
            [
                "wechat.exe",
                "\\wechat\\",
                "\\tencent\\wechat",
                "weixin",
                "wechatapp",
            ]
            .as_slice(),
        ),
        (
            "Microsoft Teams",
            ["ms-teams", "teams.exe", "\\microsoft\\teams", "msteams"].as_slice(),
        ),
        (
            "Microsoft Edge",
            ["msedge.exe", "microsoftedgeautolaunch", "\\microsoft\\edge"].as_slice(),
        ),
        (
            "OneNote",
            ["onenote", "发送至 onenote", "发送到 onenote", "send to onenote"].as_slice(),
        ),
    ];

    for (name, patterns) in rules {
        if patterns.iter().any(|pattern| haystack.contains(pattern)) {
            return Some(name.to_string());
        }
    }

    None
}

fn clean_app_name(name: &str) -> String {
    let trimmed = name.trim();
    let without_suffix = trimmed
        .strip_suffix(".exe")
        .or_else(|| trimmed.strip_suffix(".EXE"))
        .unwrap_or(trimmed);
    without_suffix.trim().to_string()
}

fn executable_path_from_command(command: &str) -> Option<String> {
    let expanded = expand_env_vars(command.trim());
    if expanded.starts_with('"') {
        if let Some(end) = expanded[1..].find('"') {
            let candidate = &expanded[1..1 + end];
            if candidate.to_lowercase().ends_with(".exe") {
                return Some(candidate.to_string());
            }
        }
    }

    let lower = expanded.to_lowercase();
    if let Some(index) = lower.find(".exe") {
        let mut start = 0;
        for (pos, ch) in expanded[..index].char_indices().rev() {
            if ch == '"' || ch == '\'' || ch == '\t' || ch == '\n' || ch == '\r' {
                start = pos + ch.len_utf8();
                break;
            }
        }
        return Some(expanded[start..index + 4].trim().trim_matches('"').to_string());
    }

    None
}

fn expand_env_vars(input: &str) -> String {
    let mut output = String::new();
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '%' {
            if let Some(end) = chars[i + 1..].iter().position(|ch| *ch == '%') {
                let key: String = chars[i + 1..i + 1 + end].iter().collect();
                if let Ok(value) = std::env::var(&key) {
                    output.push_str(&value);
                    i += end + 2;
                    continue;
                }
            }
        }
        output.push(chars[i]);
        i += 1;
    }
    output
}

fn classify_risk(name: &str, command: Option<&str>) -> (RiskLevel, Option<String>) {
    let command = command.unwrap_or_default().to_lowercase();
    for entry in ["cmd.exe", "powershell.exe", "rundll32.exe", "wscript.exe"] {
        if includes_executable(&command, entry) {
            return (
                RiskLevel::Unknown,
                Some(format!("命令包含 {entry}，启动方式不明确")),
            );
        }
    }

    let lower_name = name.to_lowercase();
    for entry in ["lenovo", "intel", "realtek", "defender", "security", "hotkeys"] {
        if lower_name.contains(entry) {
            return (RiskLevel::Keep, Some(format!("名称包含 {entry}，建议保留")));
        }
    }

    (RiskLevel::Normal, None)
}

fn includes_executable(command: &str, executable: &str) -> bool {
    let mut start = 0;
    while let Some(index) = command[start..].find(executable) {
        let absolute = start + index;
        let before_ok = absolute == 0
            || command[..absolute]
                .chars()
                .next_back()
                .is_some_and(is_executable_boundary_before);
        let after_index = absolute + executable.len();
        let after_ok = after_index == command.len()
            || command[after_index..]
                .chars()
                .next()
                .is_some_and(is_executable_boundary_after);

        if before_ok && after_ok {
            return true;
        }

        start = after_index;
    }

    false
}

fn is_executable_boundary_before(ch: char) -> bool {
    matches!(ch, '\\' | '/' | '"' | '\'' | ' ' | '\t' | '\r' | '\n')
}

fn is_executable_boundary_after(ch: char) -> bool {
    matches!(ch, '\\' | '/' | '"' | '\'' | ' ' | '\t' | '\r' | '\n' | '-')
}

fn source_to_str(source: &StartupSource) -> &'static str {
    match source {
        StartupSource::Registry => "registry",
        StartupSource::StartupFolder => "startup-folder",
    }
}

fn str_to_source(source: &str) -> StartupSource {
    match source {
        "startup-folder" => StartupSource::StartupFolder,
        _ => StartupSource::Registry,
    }
}

fn message(text: &str) -> FreshStartError {
    FreshStartError::Message(text.to_string())
}

#[cfg(windows)]
fn scan_active_items() -> AppResult<Vec<StartupItem>> {
    let mut items = scan_registry_items()?;
    items.extend(scan_startup_folder_items()?);
    Ok(items)
}

#[cfg(not(windows))]
fn scan_active_items() -> AppResult<Vec<StartupItem>> {
    Ok(vec![])
}

#[cfg(windows)]
fn scan_registry_items() -> AppResult<Vec<StartupItem>> {
    let mut items = scan_registry_run_key("registry", "Software\\Microsoft\\Windows\\CurrentVersion\\Run")?;
    items.extend(scan_registry_run_key(
        "registry32",
        "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run",
    )?);

    Ok(items)
}

#[cfg(windows)]
fn scan_registry_run_key(id_prefix: &str, key_path: &str) -> AppResult<Vec<StartupItem>> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = match hkcu.open_subkey_with_flags(key_path, KEY_READ) {
        Ok(key) => key,
        Err(_) => return Ok(vec![]),
    };
    let mut items = Vec::new();

    for value in key.enum_values() {
        let (value_name, _) = value?;
        let command: String = key.get_value(&value_name).unwrap_or_default();
        let app_path = executable_path_from_command(&command);
        let name = friendly_app_name(&value_name, Some(&command), app_path.as_deref());
        let (risk_level, risk_reason) = classify_risk(&name, Some(&command));
        items.push(StartupItem {
            id: format!("{id_prefix}:{value_name}"),
            name,
            raw_name: Some(value_name),
            source: StartupSource::Registry,
            enabled: true,
            command: Some(command),
            path: None,
            app_path,
            risk_level,
            risk_reason,
            disabled_at: None,
            remembered: false,
        });
    }

    Ok(items)
}

#[cfg(windows)]
fn scan_startup_folder_items() -> AppResult<Vec<StartupItem>> {
    let dir = startup_folder_dir()?;
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut items = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let is_lnk = path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("lnk"));
        if !is_lnk {
            continue;
        }

        let file_name = entry.file_name().to_string_lossy().to_string();
        let path_string = path.to_string_lossy().to_string();
        let name = friendly_app_name(&file_name, Some(&path_string), Some(&path_string));
        let (risk_level, risk_reason) = classify_risk(&name, Some(&path_string));
        items.push(StartupItem {
            id: format!("startup-folder:{file_name}"),
            name,
            raw_name: Some(file_name),
            source: StartupSource::StartupFolder,
            enabled: true,
            command: Some(path_string.clone()),
            path: Some(path_string.clone()),
            app_path: Some(path_string),
            risk_level,
            risk_reason,
            disabled_at: None,
            remembered: false,
        });
    }

    Ok(items)
}

#[cfg(windows)]
fn read_registry_value_at(key_path: &str, value_name: &str) -> AppResult<String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu.open_subkey_with_flags(key_path, KEY_READ)?;
    key.get_value(value_name)
        .map_err(|_| message("注册表启动项不存在，请刷新后重试"))
}

#[cfg(not(windows))]
fn read_registry_value_at(_key_path: &str, _value_name: &str) -> AppResult<String> {
    Err(message("注册表操作只支持 Windows"))
}

#[cfg(windows)]
fn registry_value_exists_at(key_path: &str, value_name: &str) -> AppResult<bool> {
    Ok(read_registry_value_at(key_path, value_name).is_ok())
}

#[cfg(not(windows))]
fn registry_value_exists_at(_key_path: &str, _value_name: &str) -> AppResult<bool> {
    Ok(false)
}

#[cfg(windows)]
fn write_registry_value_at(key_path: &str, value_name: &str, command: &str) -> AppResult<()> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu.open_subkey_with_flags(key_path, KEY_WRITE)?;
    key.set_value(value_name, &command)?;
    Ok(())
}

#[cfg(not(windows))]
fn write_registry_value_at(_key_path: &str, _value_name: &str, _command: &str) -> AppResult<()> {
    Err(message("注册表操作只支持 Windows"))
}

#[cfg(windows)]
fn delete_registry_value_at(key_path: &str, value_name: &str) -> AppResult<()> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu.open_subkey_with_flags(key_path, KEY_WRITE)?;
    key.delete_value(value_name)?;
    Ok(())
}

#[cfg(not(windows))]
fn delete_registry_value_at(_key_path: &str, _value_name: &str) -> AppResult<()> {
    Err(message("注册表操作只支持 Windows"))
}

#[cfg(windows)]
fn version_display_name(path: &str) -> Option<String> {
    use std::ffi::c_void;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
    };

    let path_wide = to_wide(path);
    let mut handle = 0;
    let size = unsafe { GetFileVersionInfoSizeW(PCWSTR(path_wide.as_ptr()), Some(&mut handle)) };
    if size == 0 {
        return None;
    }

    let mut data = vec![0_u8; size as usize];
    unsafe {
        GetFileVersionInfoW(
            PCWSTR(path_wide.as_ptr()),
            Some(0),
            size,
            data.as_mut_ptr() as *mut c_void,
        )
        .ok()?;
    }

    let translations = query_translation(&data).unwrap_or_else(|| vec![(0x0409, 0x04b0), (0x0804, 0x04b0)]);
    for key in ["FileDescription", "ProductName"] {
        for (lang, codepage) in &translations {
            let sub_block = format!("\\StringFileInfo\\{lang:04x}{codepage:04x}\\{key}");
            if let Some(value) = query_version_string(&data, &sub_block) {
                if !value.trim().is_empty() {
                    return Some(value);
                }
            }
        }
    }

    fn query_translation(data: &[u8]) -> Option<Vec<(u16, u16)>> {
        let mut ptr: *mut c_void = std::ptr::null_mut();
        let mut len = 0_u32;
        let block = to_wide("\\VarFileInfo\\Translation");
        let ok = unsafe {
            VerQueryValueW(
                data.as_ptr() as *const c_void,
                PCWSTR(block.as_ptr()),
                &mut ptr,
                &mut len,
            )
        }
        .as_bool();
        if !ok || ptr.is_null() || len < 4 {
            return None;
        }

        let raw = unsafe { std::slice::from_raw_parts(ptr as *const u16, (len / 2) as usize) };
        let mut values = Vec::new();
        for pair in raw.chunks_exact(2) {
            values.push((pair[0], pair[1]));
        }
        Some(values)
    }

    fn query_version_string(data: &[u8], sub_block: &str) -> Option<String> {
        let mut ptr: *mut c_void = std::ptr::null_mut();
        let mut len = 0_u32;
        let block = to_wide(sub_block);
        let ok = unsafe {
            VerQueryValueW(
                data.as_ptr() as *const c_void,
                PCWSTR(block.as_ptr()),
                &mut ptr,
                &mut len,
            )
        }
        .as_bool();
        if !ok || ptr.is_null() || len == 0 {
            return None;
        }

        let raw = unsafe { std::slice::from_raw_parts(ptr as *const u16, len as usize) };
        let end = raw.iter().position(|ch| *ch == 0).unwrap_or(raw.len());
        Some(String::from_utf16_lossy(&raw[..end]))
    }

    None
}

#[cfg(not(windows))]
fn version_display_name(_path: &str) -> Option<String> {
    None
}

#[cfg(windows)]
fn to_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn registry_key_path_for_id(id: &str) -> &'static str {
    if id.starts_with("registry32:") {
        "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run"
    } else {
        "Software\\Microsoft\\Windows\\CurrentVersion\\Run"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_quoted_executable_path() {
        let path = executable_path_from_command("\"C:\\Program Files\\App\\app.exe\" --startup");
        assert_eq!(path.as_deref(), Some("C:\\Program Files\\App\\app.exe"));
    }

    #[test]
    fn parses_unquoted_executable_path_with_spaces() {
        let path = executable_path_from_command("C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe --auto");
        assert_eq!(
            path.as_deref(),
            Some("C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe")
        );
    }

    #[test]
    fn does_not_treat_hkcmd_as_cmd() {
        let (risk, _) = classify_risk("Intel Hotkeys", Some("C:\\Intel\\hkcmd.exe"));
        assert_eq!(risk, RiskLevel::Keep);
    }

    #[test]
    fn sqlite_keeps_disabled_history_after_active_item_disappears() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        let now = "2026-06-16T00:00:00Z";
        let item = StartupItem {
            id: "registry:FreshStartTest".to_string(),
            name: "FreshStartTest".to_string(),
            raw_name: Some("FreshStartTest".to_string()),
            source: StartupSource::Registry,
            enabled: true,
            command: Some("notepad.exe".to_string()),
            path: None,
            app_path: Some("notepad.exe".to_string()),
            risk_level: RiskLevel::Normal,
            risk_reason: None,
            disabled_at: None,
            remembered: false,
        };

        upsert_seen_item(&conn, &item, now).unwrap();
        mark_disabled(&conn, &item.id, item.command.as_deref(), None, None, now).unwrap();

        let record = load_record(&conn, &item.id).unwrap().unwrap();
        let disabled = record_to_disabled_item(&record);
        assert!(!disabled.enabled);
        assert!(disabled.remembered);
        assert_eq!(disabled.command.as_deref(), Some("notepad.exe"));
    }

    #[test]
    fn recognizes_baidu_netdisk_components() {
        let name = friendly_app_name(
            "BaiduYunDetect",
            Some("\"C:\\Users\\u\\AppData\\Roaming\\baidu\\BaiduNetdisk\\YunDetectService.exe\""),
            Some("C:\\Users\\u\\AppData\\Roaming\\baidu\\BaiduNetdisk\\YunDetectService.exe"),
        );
        assert_eq!(name, "百度网盘");
    }

    #[test]
    fn recognizes_wechat_from_path() {
        let name = friendly_app_name(
            "WeChat",
            Some("\"C:\\Program Files\\Tencent\\WeChat\\WeChat.exe\""),
            Some("C:\\Program Files\\Tencent\\WeChat\\WeChat.exe"),
        );
        assert_eq!(name, "微信");
    }

    #[test]
    fn registry32_uses_wow6432node_run_path() {
        assert_eq!(
            registry_key_path_for_id("registry32:Example"),
            "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run"
        );
    }

    #[test]
    fn recognizes_send_to_onenote_shortcut() {
        let name = friendly_app_name(
            "发送至 OneNote.lnk",
            Some("C:\\Users\\u\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\发送至 OneNote.lnk"),
            Some("C:\\Users\\u\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\发送至 OneNote.lnk"),
        );
        assert_eq!(name, "OneNote");
    }
}
