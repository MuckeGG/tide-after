//! Server-side persistence contract for the Tide After single-player vertical slice.
//!
//! The upstream project already owns generic names such as `world_state` and
//! `consume_item`, so this module intentionally prefixes its public tables and
//! reducers with `tide_`. This lets the raft game coexist with the reusable
//! upstream survival systems while generated bindings are migrated gradually.

use spacetimedb::{reducer, table, Identity, ReducerContext, Table, Timestamp};

const START_HEALTH: f32 = 100.0;
const START_HUNGER: f32 = 100.0;
const START_THIRST: f32 = 100.0;
const COLLECT_RANGE_SQUARED: f32 = 178.0 * 178.0;

#[table(name = tide_player_state, public)]
#[derive(Clone, Debug)]
pub struct TidePlayerState {
    #[primary_key]
    pub player_identity: Identity,
    pub guest_id: String,
    pub run_id: String,
    pub health: f32,
    pub hunger: f32,
    pub thirst: f32,
    pub pos_x: f32,
    pub pos_y: f32,
    pub game_over: bool,
    pub fishing_active: bool,
    pub fishing_target_start: f32,
    pub updated_at: Timestamp,
}

#[table(name = tide_world_state, public)]
#[derive(Clone, Debug)]
pub struct TideWorldState {
    #[primary_key]
    pub player_identity: Identity,
    pub run_id: String,
    pub seed: u64,
    pub elapsed_seconds: f32,
    pub day: u32,
    pub time_of_day: f32,
    pub weather: String,
    pub updated_at: Timestamp,
}

#[table(name = tide_inventory_item, public)]
#[derive(Clone, Debug)]
pub struct TideInventoryItem {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub player_identity: Identity,
    pub item_type: String,
    pub quantity: u32,
}

#[table(name = tide_raft_tile, public)]
#[derive(Clone, Debug)]
pub struct TideRaftTile {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub player_identity: Identity,
    pub run_id: String,
    pub grid_x: i32,
    pub grid_y: i32,
    pub module: String,
}

#[table(name = tide_floating_item, public)]
#[derive(Clone, Debug)]
pub struct TideFloatingItem {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub player_identity: Identity,
    pub run_id: String,
    pub item_type: String,
    pub pos_x: f32,
    pub pos_y: f32,
    pub expires_at: Timestamp,
    pub collected: bool,
}

/// Versioned full-state snapshot used by the web client for reconnects. The
/// normalized tables above remain authoritative for validated game actions;
/// this row makes the first vertical slice resilient while bindings evolve.
#[table(name = tide_game_snapshot, public)]
#[derive(Clone, Debug)]
pub struct TideGameSnapshot {
    #[primary_key]
    pub player_identity: Identity,
    pub schema_version: u32,
    pub guest_id: String,
    pub run_id: String,
    pub state_json: String,
    pub updated_at: Timestamp,
}

fn validate_identifier(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 96 {
        return Err(format!("{} must be between 1 and 96 characters", label));
    }
    Ok(())
}

fn inventory_quantity(ctx: &ReducerContext, owner: Identity, item_type: &str) -> u32 {
    ctx.db
        .tide_inventory_item()
        .iter()
        .find(|item| item.player_identity == owner && item.item_type == item_type)
        .map(|item| item.quantity)
        .unwrap_or(0)
}

fn set_inventory_quantity(
    ctx: &ReducerContext,
    owner: Identity,
    item_type: &str,
    quantity: u32,
) -> Result<(), String> {
    let table = ctx.db.tide_inventory_item();
    if let Some(mut item) = table
        .iter()
        .find(|item| item.player_identity == owner && item.item_type == item_type)
    {
        item.quantity = quantity;
        table.id().update(item);
    } else {
        table.try_insert(TideInventoryItem {
            id: 0,
            player_identity: owner,
            item_type: item_type.to_string(),
            quantity,
        })?;
    }
    Ok(())
}

fn add_inventory(
    ctx: &ReducerContext,
    owner: Identity,
    item_type: &str,
    quantity: u32,
) -> Result<(), String> {
    let current = inventory_quantity(ctx, owner, item_type);
    set_inventory_quantity(ctx, owner, item_type, current.saturating_add(quantity))
}

fn spend_inventory(
    ctx: &ReducerContext,
    owner: Identity,
    costs: &[(&str, u32)],
) -> Result<(), String> {
    for (item_type, quantity) in costs {
        if inventory_quantity(ctx, owner, item_type) < *quantity {
            return Err(format!("Not enough {}", item_type));
        }
    }
    for (item_type, quantity) in costs {
        let current = inventory_quantity(ctx, owner, item_type);
        set_inventory_quantity(ctx, owner, item_type, current - quantity)?;
    }
    Ok(())
}

fn clear_run_rows(ctx: &ReducerContext, owner: Identity) {
    let inventory_ids: Vec<u64> = ctx
        .db
        .tide_inventory_item()
        .iter()
        .filter(|item| item.player_identity == owner)
        .map(|item| item.id)
        .collect();
    for id in inventory_ids {
        ctx.db.tide_inventory_item().id().delete(id);
    }

    let tile_ids: Vec<u64> = ctx
        .db
        .tide_raft_tile()
        .iter()
        .filter(|tile| tile.player_identity == owner)
        .map(|tile| tile.id)
        .collect();
    for id in tile_ids {
        ctx.db.tide_raft_tile().id().delete(id);
    }

    let floating_ids: Vec<u64> = ctx
        .db
        .tide_floating_item()
        .iter()
        .filter(|item| item.player_identity == owner)
        .map(|item| item.id)
        .collect();
    for id in floating_ids {
        ctx.db.tide_floating_item().id().delete(id);
    }
}

fn seed_starting_rows(ctx: &ReducerContext, owner: Identity, run_id: &str) -> Result<(), String> {
    for (item_type, quantity) in [
        ("wood", 4),
        ("plastic", 3),
        ("scrap", 1),
        ("fiber", 0),
        ("fish", 0),
        ("meal", 0),
        ("water", 0),
        ("parts", 0),
    ] {
        set_inventory_quantity(ctx, owner, item_type, quantity)?;
    }

    for (grid_x, grid_y) in [(-1, -1), (0, -1), (-1, 0), (0, 0)] {
        ctx.db.tide_raft_tile().try_insert(TideRaftTile {
            id: 0,
            player_identity: owner,
            run_id: run_id.to_string(),
            grid_x,
            grid_y,
            module: "base".to_string(),
        })?;
    }
    Ok(())
}

#[reducer]
pub fn tide_create_guest_player(
    ctx: &ReducerContext,
    guest_id: String,
    run_id: String,
    seed: u64,
) -> Result<(), String> {
    validate_identifier(&guest_id, "guest_id")?;
    validate_identifier(&run_id, "run_id")?;
    let owner = ctx.sender;
    if ctx.db.tide_player_state().player_identity().find(&owner).is_some() {
        return Ok(());
    }

    ctx.db.tide_player_state().try_insert(TidePlayerState {
        player_identity: owner,
        guest_id,
        run_id: run_id.clone(),
        health: START_HEALTH,
        hunger: START_HUNGER,
        thirst: START_THIRST,
        pos_x: 480.0,
        pos_y: 270.0,
        game_over: false,
        fishing_active: false,
        fishing_target_start: 40.0,
        updated_at: ctx.timestamp,
    })?;
    ctx.db.tide_world_state().try_insert(TideWorldState {
        player_identity: owner,
        run_id: run_id.clone(),
        seed,
        elapsed_seconds: 0.0,
        day: 1,
        time_of_day: 0.28,
        weather: "clear".to_string(),
        updated_at: ctx.timestamp,
    })?;
    seed_starting_rows(ctx, owner, &run_id)
}

#[reducer]
pub fn tide_start_new_run(
    ctx: &ReducerContext,
    run_id: String,
    seed: u64,
) -> Result<(), String> {
    validate_identifier(&run_id, "run_id")?;
    let owner = ctx.sender;
    let mut player = ctx
        .db
        .tide_player_state()
        .player_identity()
        .find(&owner)
        .ok_or_else(|| "Guest player has not been created".to_string())?;

    clear_run_rows(ctx, owner);
    player.run_id = run_id.clone();
    player.health = START_HEALTH;
    player.hunger = START_HUNGER;
    player.thirst = START_THIRST;
    player.pos_x = 480.0;
    player.pos_y = 270.0;
    player.game_over = false;
    player.fishing_active = false;
    player.updated_at = ctx.timestamp;
    ctx.db.tide_player_state().player_identity().update(player);

    let world = TideWorldState {
        player_identity: owner,
        run_id: run_id.clone(),
        seed,
        elapsed_seconds: 0.0,
        day: 1,
        time_of_day: 0.28,
        weather: "clear".to_string(),
        updated_at: ctx.timestamp,
    };
    if ctx.db.tide_world_state().player_identity().find(&owner).is_some() {
        ctx.db.tide_world_state().player_identity().update(world);
    } else {
        ctx.db.tide_world_state().try_insert(world)?;
    }
    seed_starting_rows(ctx, owner, &run_id)
}

#[reducer]
pub fn tide_move_player(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> Result<(), String> {
    if !pos_x.is_finite() || !pos_y.is_finite() {
        return Err("Position must be finite".to_string());
    }
    let owner = ctx.sender;
    let mut player = ctx
        .db
        .tide_player_state()
        .player_identity()
        .find(&owner)
        .ok_or_else(|| "Player not found".to_string())?;
    if player.game_over {
        return Err("Run has ended".to_string());
    }
    let raft_tiles = ctx
        .db
        .tide_raft_tile()
        .iter()
        .filter(|tile| {
            tile.player_identity == owner
                && matches!(tile.module.as_str(), "base" | "deck" | "reinforcedDeck")
        })
        .count();
    let half_extent = if raft_tiles >= 16 {
        136.0
    } else if raft_tiles >= 9 {
        102.0
    } else {
        68.0
    };
    if pos_x < 480.0 - half_extent || pos_x > 480.0 + half_extent ||
       pos_y < 270.0 - half_extent || pos_y > 270.0 + half_extent {
        return Err("Position is outside the raft".to_string());
    }
    player.pos_x = pos_x;
    player.pos_y = pos_y;
    player.updated_at = ctx.timestamp;
    ctx.db.tide_player_state().player_identity().update(player);
    Ok(())
}

#[reducer]
pub fn tide_collect_floating_item(ctx: &ReducerContext, item_id: u64) -> Result<(), String> {
    let owner = ctx.sender;
    let player = ctx
        .db
        .tide_player_state()
        .player_identity()
        .find(&owner)
        .ok_or_else(|| "Player not found".to_string())?;
    if player.game_over {
        return Err("Run has ended".to_string());
    }
    let mut item = ctx
        .db
        .tide_floating_item()
        .id()
        .find(&item_id)
        .ok_or_else(|| "Floating item not found".to_string())?;
    if item.player_identity != owner || item.run_id != player.run_id || item.collected {
        return Err("Floating item is not available to this player".to_string());
    }
    let dx = item.pos_x - player.pos_x;
    let dy = item.pos_y - player.pos_y;
    if dx * dx + dy * dy > COLLECT_RANGE_SQUARED {
        return Err("Floating item is out of range".to_string());
    }
    item.collected = true;
    let item_type = item.item_type.clone();
    ctx.db.tide_floating_item().id().update(item);
    add_inventory(ctx, owner, &item_type, 1)
}

#[reducer]
pub fn tide_start_fishing(ctx: &ReducerContext, target_start: f32) -> Result<(), String> {
    if !(10.0..=75.0).contains(&target_start) {
        return Err("Fishing target is outside the accepted range".to_string());
    }
    let owner = ctx.sender;
    let mut player = ctx
        .db
        .tide_player_state()
        .player_identity()
        .find(&owner)
        .ok_or_else(|| "Player not found".to_string())?;
    if player.game_over || player.fishing_active {
        return Err("Fishing is not available".to_string());
    }
    player.fishing_active = true;
    player.fishing_target_start = target_start;
    player.updated_at = ctx.timestamp;
    ctx.db.tide_player_state().player_identity().update(player);
    Ok(())
}

#[reducer]
pub fn tide_resolve_fishing(ctx: &ReducerContext, marker: f32) -> Result<(), String> {
    if !(0.0..=100.0).contains(&marker) {
        return Err("Fishing marker is outside the accepted range".to_string());
    }
    let owner = ctx.sender;
    let mut player = ctx
        .db
        .tide_player_state()
        .player_identity()
        .find(&owner)
        .ok_or_else(|| "Player not found".to_string())?;
    if !player.fishing_active {
        return Err("Fishing has not started".to_string());
    }
    player.fishing_active = false;
    let success = marker >= player.fishing_target_start && marker <= player.fishing_target_start + 20.0;
    player.updated_at = ctx.timestamp;
    ctx.db.tide_player_state().player_identity().update(player);
    if success {
        add_inventory(ctx, owner, "fish", 1)?;
    }
    Ok(())
}

#[reducer]
pub fn tide_consume_item(ctx: &ReducerContext, item_type: String) -> Result<(), String> {
    if item_type != "fish" && item_type != "meal" && item_type != "water" {
        return Err("Only fish, meal, and water are consumable".to_string());
    }
    let owner = ctx.sender;
    let quantity = inventory_quantity(ctx, owner, &item_type);
    if quantity == 0 {
        return Err("Item is not available".to_string());
    }
    let mut player = ctx
        .db
        .tide_player_state()
        .player_identity()
        .find(&owner)
        .ok_or_else(|| "Player not found".to_string())?;
    if player.game_over {
        return Err("Run has ended".to_string());
    }
    if item_type == "fish" {
        player.hunger = (player.hunger + 18.0).min(100.0);
    } else if item_type == "meal" {
        player.hunger = (player.hunger + 46.0).min(100.0);
        player.health = (player.health + 7.0).min(100.0);
    } else {
        player.thirst = (player.thirst + 32.0).min(100.0);
    }
    player.updated_at = ctx.timestamp;
    ctx.db.tide_player_state().player_identity().update(player);
    set_inventory_quantity(ctx, owner, &item_type, quantity - 1)
}

#[reducer]
pub fn tide_build_raft_module(ctx: &ReducerContext, module: String) -> Result<(), String> {
    let owner = ctx.sender;
    let player = ctx
        .db
        .tide_player_state()
        .player_identity()
        .find(&owner)
        .ok_or_else(|| "Player not found".to_string())?;
    if player.game_over {
        return Err("Run has ended".to_string());
    }
    if ctx
        .db
        .tide_raft_tile()
        .iter()
        .any(|tile| tile.player_identity == owner && tile.module == module)
    {
        return Err("Module already exists".to_string());
    }

    let module_built = |module_name: &str| {
        ctx
            .db
            .tide_raft_tile()
            .iter()
            .any(|tile| tile.player_identity == owner && tile.module == module_name)
    };
    let deck_built = ctx
        .db
        .tide_raft_tile()
        .iter()
        .filter(|tile| {
            tile.player_identity == owner
                && matches!(tile.module.as_str(), "base" | "deck" | "reinforcedDeck")
        })
        .count() >= 9;
    let reinforced_built = module_built("reinforcedDeck");
    let workshop_built = module_built("workshop");
    let radio_built = module_built("radio");
    let costs: &[(&str, u32)] = match module.as_str() {
        "deck" => &[("wood", 6), ("plastic", 4)],
        "net" if deck_built => &[("wood", 4), ("plastic", 6), ("scrap", 1)],
        "purifier" if deck_built => &[("wood", 8), ("plastic", 4), ("scrap", 2)],
        "grill" if deck_built => &[("wood", 6), ("plastic", 2), ("scrap", 3), ("fiber", 2)],
        "storage" if deck_built => &[("wood", 8), ("plastic", 4), ("scrap", 2), ("fiber", 4)],
        "reinforcedDeck" if deck_built => &[("wood", 14), ("plastic", 8), ("scrap", 5), ("fiber", 6)],
        "workshop" if reinforced_built => &[("wood", 12), ("plastic", 8), ("scrap", 6), ("fiber", 4)],
        "sail" if reinforced_built => &[("wood", 10), ("plastic", 6), ("scrap", 4), ("fiber", 8)],
        "garden" if workshop_built => &[("wood", 12), ("plastic", 8), ("scrap", 5), ("fiber", 10)],
        "radio" if workshop_built => &[("wood", 18), ("plastic", 12), ("scrap", 10), ("parts", 6)],
        "beacon" if radio_built => &[("wood", 26), ("plastic", 18), ("scrap", 16), ("parts", 12)],
        "net" | "purifier" | "grill" | "storage" | "reinforcedDeck" => {
            return Err("Expand the deck first".to_string())
        }
        "workshop" | "sail" => return Err("Build the reinforced deck first".to_string()),
        "garden" | "radio" => return Err("Build the workshop first".to_string()),
        "beacon" => return Err("Build the radio first".to_string()),
        _ => return Err("Unknown raft module".to_string()),
    };
    spend_inventory(ctx, owner, costs)?;

    if module == "deck" {
        let existing: Vec<(i32, i32)> = ctx
            .db
            .tide_raft_tile()
            .iter()
            .filter(|tile| tile.player_identity == owner)
            .map(|tile| (tile.grid_x, tile.grid_y))
            .collect();
        for grid_y in -1..=1 {
            for grid_x in -1..=1 {
                if !existing.contains(&(grid_x, grid_y)) {
                    ctx.db.tide_raft_tile().try_insert(TideRaftTile {
                        id: 0,
                        player_identity: owner,
                        run_id: player.run_id.clone(),
                        grid_x,
                        grid_y,
                        module: "deck".to_string(),
                    })?;
                }
            }
        }
    } else if module == "reinforcedDeck" {
        let existing: Vec<(i32, i32)> = ctx
            .db
            .tide_raft_tile()
            .iter()
            .filter(|tile| {
                tile.player_identity == owner
                    && matches!(tile.module.as_str(), "base" | "deck" | "reinforcedDeck")
            })
            .map(|tile| (tile.grid_x, tile.grid_y))
            .collect();
        for grid_y in -2..=1 {
            for grid_x in -2..=1 {
                if !existing.contains(&(grid_x, grid_y)) {
                    ctx.db.tide_raft_tile().try_insert(TideRaftTile {
                        id: 0,
                        player_identity: owner,
                        run_id: player.run_id.clone(),
                        grid_x,
                        grid_y,
                        module: "reinforcedDeck".to_string(),
                    })?;
                }
            }
        }
    } else {
        let (grid_x, grid_y) = match module.as_str() {
            "net" => (0, 1),
            "purifier" => (-1, -1),
            "grill" => (1, -1),
            "storage" => (-1, 1),
            "workshop" => (0, 0),
            "sail" => (1, 0),
            "garden" => (1, 1),
            "radio" => (-1, 0),
            "beacon" => (0, -1),
            _ => (0, 0),
        };
        ctx.db.tide_raft_tile().try_insert(TideRaftTile {
            id: 0,
            player_identity: owner,
            run_id: player.run_id.clone(),
            grid_x,
            grid_y,
            module,
        })?;
    }
    Ok(())
}

#[reducer]
pub fn tide_advance_game_time(ctx: &ReducerContext, delta_seconds: f32) -> Result<(), String> {
    if !delta_seconds.is_finite() || delta_seconds <= 0.0 || delta_seconds > 1.0 {
        return Err("delta_seconds must be between 0 and 1".to_string());
    }
    let owner = ctx.sender;
    let mut player = ctx
        .db
        .tide_player_state()
        .player_identity()
        .find(&owner)
        .ok_or_else(|| "Player not found".to_string())?;
    if player.game_over {
        return Ok(());
    }
    player.hunger = (player.hunger - 0.18 * delta_seconds).max(0.0);
    player.thirst = (player.thirst - 0.28 * delta_seconds).max(0.0);
    if player.hunger <= 0.0 || player.thirst <= 0.0 {
        player.health = (player.health - 0.72 * delta_seconds).max(0.0);
    }
    player.game_over = player.health <= 0.0;
    player.updated_at = ctx.timestamp;
    ctx.db.tide_player_state().player_identity().update(player);

    if let Some(mut world) = ctx.db.tide_world_state().player_identity().find(&owner) {
        world.elapsed_seconds += delta_seconds;
        world.day = (world.elapsed_seconds / 150.0).floor() as u32 + 1;
        world.time_of_day = (0.24 + world.elapsed_seconds / 150.0) % 1.0;
        world.updated_at = ctx.timestamp;
        ctx.db.tide_world_state().player_identity().update(world);
    }
    Ok(())
}

#[reducer]
pub fn tide_save_checkpoint(ctx: &ReducerContext) -> Result<(), String> {
    let owner = ctx.sender;
    let mut player = ctx
        .db
        .tide_player_state()
        .player_identity()
        .find(&owner)
        .ok_or_else(|| "Player not found".to_string())?;
    player.updated_at = ctx.timestamp;
    ctx.db.tide_player_state().player_identity().update(player);
    if let Some(mut world) = ctx.db.tide_world_state().player_identity().find(&owner) {
        world.updated_at = ctx.timestamp;
        ctx.db.tide_world_state().player_identity().update(world);
    }
    Ok(())
}

#[reducer]
pub fn tide_sync_snapshot(
    ctx: &ReducerContext,
    schema_version: u32,
    guest_id: String,
    run_id: String,
    state_json: String,
) -> Result<(), String> {
    validate_identifier(&guest_id, "guest_id")?;
    validate_identifier(&run_id, "run_id")?;
    if schema_version != 2 {
        return Err("Unsupported snapshot schema version".to_string());
    }
    if state_json.len() > 131_072 {
        return Err("Snapshot exceeds 128 KiB".to_string());
    }
    let owner = ctx.sender;
    let snapshot = TideGameSnapshot {
        player_identity: owner,
        schema_version,
        guest_id,
        run_id,
        state_json,
        updated_at: ctx.timestamp,
    };
    if ctx.db.tide_game_snapshot().player_identity().find(&owner).is_some() {
        ctx.db.tide_game_snapshot().player_identity().update(snapshot);
    } else {
        ctx.db.tide_game_snapshot().try_insert(snapshot)?;
    }
    Ok(())
}
