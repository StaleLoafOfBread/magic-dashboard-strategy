import * as helpers from "./helpers.js";

const TEMPERATURE_THRESHOLDS = [
  { color: "red", operator: "gte", value: 72 },
  { color: "cyan", operator: "lte", value: 60 },
];

function indexBy(arr, key) {
  return Object.fromEntries((arr ?? []).map((obj) => [obj[key], obj]));
}

function floorEntities(floorId) {
  return {
    door: `binary_sensor.magic_areas_aggregates_${floorId}_aggregate_door`,
    motion: `binary_sensor.magic_areas_aggregates_${floorId}_aggregate_motion`,
    presence: `binary_sensor.magic_areas_presence_tracking_${floorId}_area_state`,
    temperature: `sensor.magic_areas_aggregates_${floorId}_aggregate_temperature`,
  };
}

function visibleWhenOn(entityId) {
  return [
    {
      condition: "state",
      entity: entityId,
      state: "on",
    },
  ];
}

function entityBadge(
  entity,
  { onlyWhenOn = false, show_state, tap_action } = {},
) {
  const badge = { type: "entity", entity };

  if (tap_action) badge.tap_action = tap_action;
  if (show_state !== undefined) badge.show_state = show_state;
  if (onlyWhenOn) badge.visibility = visibleWhenOn(entity);

  return badge;
}

function createFloorHeader(floorGroup) {
  const floorId = floorGroup.floor_id;

  if (floorGroup._is_unassigned) {
    return {
      type: "heading",
      heading: floorGroup.name || "Unassigned",
      heading_style: "title",
      icon: floorGroup.icon || "mdi:help-circle",
      badges: [],
    };
  }

  const e = floorEntities(floorId);
  const moreInfo = { action: "more-info" };

  const badges = [
    entityBadge(e.door, { onlyWhenOn: true, tap_action: moreInfo }),
    entityBadge(e.motion, {
      onlyWhenOn: true,
      show_state: false,
      tap_action: moreInfo,
    }),
    entityBadge(e.presence, { tap_action: moreInfo }),
    entityBadge(e.temperature, { tap_action: moreInfo }),
  ];

  return {
    type: "heading",
    heading: floorGroup.name || "Floor",
    heading_style: "title",
    icon: floorGroup.icon ?? helpers.floorIconForLevel(floorGroup.level ?? 0),
    badges,
  };
}
function createRoomSummaryCard(areaId) {
  return {
    type: "custom:room-summary-card",
    area: areaId,
    problem: { display: "active_only" },
    navigate: `${areaId}`,
    styles: { sensors: {} },
    features: [
      "multi_light_background",
      "hide_hidden_entities",
      "skip_climate_styles",
    ],
    smoke: { entities: [null] },
    gas: { entities: [null] },
    water: { entities: [null] },
    occupancy: {
      entities: [
        `binary_sensor.magic_areas_presence_tracking_${areaId}_area_state`,
      ],
    },
    thresholds: { temperature: TEMPERATURE_THRESHOLDS },
    grid_options: { columns: 6, rows: 3 },
  };
}

class HomeView {
  static async generate(config, hass) {
    const areas = config?.areas || [];
    let floors = config?.floors || [];
    const hidden = new Set(config?.hide_areas || []);

    // If you forgot to pass floors in options, fetch them so floor names exist.
    if (!floors || floors.length === 0) {
      try {
        floors = await hass.callWS({ type: "config/floor_registry/list" });
      } catch (e) {
        // If this fails, we still render using floor_id strings.
        floors = [];
      }
    }

    const normalizeFloorId = (v) => (v == null ? "__unassigned__" : String(v));

    // Group visible areas by normalized floor_id
    const areasByFloorId = new Map();
    for (const area of areas) {
      if (hidden.has(area.area_id)) continue;

      const floorId = normalizeFloorId(area.floor_id);
      if (!areasByFloorId.has(floorId)) areasByFloorId.set(floorId, []);
      areasByFloorId.get(floorId).push(area);
    }

    if (areasByFloorId.size === 0) {
      return {
        type: "sections",
        max_columns: 4,
        dense_section_placement: true,
        sections: [],
      };
    }

    // Normalize floors too so IDs match the Map keys
    const normalizedFloors = (floors ?? []).map((f) => ({
      ...f,
      floor_id: String(f.floor_id),
    }));
    const floorsById = indexBy(normalizedFloors, "floor_id");

    // Floor groups from registry (preferred)
    const floorGroups = normalizedFloors
      .filter((f) => areasByFloorId.has(f.floor_id))
      .sort((a, b) => {
        const levelA = a.level ?? 0;
        const levelB = b.level ?? 0;
        if (levelA !== levelB) return levelB - levelA; // higher -> lower
        return (a.name || "").localeCompare(b.name || "");
      })
      .map((f) => ({
        floor_id: f.floor_id,
        name: f.name || `Floor ${f.level ?? ""}`.trim() || String(f.floor_id),
        level: f.level ?? 0,
        icon:
          f.icon ??
          (f.level === -1
            ? "mdi:home-floor-negative-1"
            : f.level >= 0 && f.level <= 3
              ? `mdi:home-floor-${f.level}`
              : "mdi:home"),

        _is_unassigned: false,
      }));

    // Add any floor_ids that appear on areas but are not in floor registry
    for (const floorId of areasByFloorId.keys()) {
      if (floorId === "__unassigned__") continue;
      if (floorsById[floorId]) continue;
      if (!(areasByFloorId.get(floorId)?.length > 0)) continue;

      floorGroups.push({
        floor_id: floorId,
        name: String(floorId),
        level: 0,
        icon: "mdi:home",
        _is_unassigned: false,
      });
    }

    // Re-sort after adding missing floors
    floorGroups.sort((a, b) => {
      const levelA = a.level ?? 0;
      const levelB = b.level ?? 0;
      if (levelA !== levelB) return levelB - levelA;
      return (a.name || "").localeCompare(b.name || "");
    });

    // Unassigned last
    if (areasByFloorId.has("__unassigned__")) {
      floorGroups.push({
        floor_id: "__unassigned__",
        name: "Unassigned",
        level: -9999,
        icon: "mdi:help-circle",
        _is_unassigned: true,
      });
    }

    // One section (grid) per floor: header + cards in the SAME section
    const sections = floorGroups.flatMap((fg) => {
      const floorAreas = (areasByFloorId.get(fg.floor_id) || [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));

      if (floorAreas.length === 0) return [];

      return [
        {
          type: "grid",
          cards: [
            createFloorHeader(fg),
            ...floorAreas.map((a) => createRoomSummaryCard(a.area_id)),
          ],
        },
      ];
    });

    return {
      type: "sections",
      max_columns: 6,
      dense_section_placement: false,
      sections: [...sections, navbarSection(floors, areas)],
    };
  }
}

function navbarSection(floors, areas) {
  return {
    type: "grid",
    cards: [helpers.NavBar(floors, areas)],
  };
}

customElements.define("ll-strategy-view-magic-home", HomeView);
