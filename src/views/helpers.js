export function entityExists(hass, entityId) {
  return entityId in hass.states;
}

export const MOBILE = 0;
export const TABLET = 768;
export const DESKTOP = 1024;
export const WIDE = 1280;

export function hideOnMobile() {
  const mobile = 0;
  const tablet = 768;
  const desktop = 1024;
  const wide = 1280;

  return {
    condition: "screen",
    media_query: `(min-width: ${tablet}px)`,
  };
}

export function filterEntitiesToMagicArea(devices, entities, area_id) {
  const magic_area_device_ids = devices
    .filter((device) => device.area_id === area_id)
    .filter((device) => device.model === "Magic Area")
    .map((device) => device.id);
  return entities.filter((entity) =>
    magic_area_device_ids.includes(entity.device_id)
  );
}

export function newGrid(cards, column_span) {
  // Ensure cards is always an array
  cards = Array.isArray(cards) ? cards : [cards];

  // Remove any null or undefined cards
  cards = filterFalsy(cards);

  // Return null if we have no cards
  if (cards.length === 0) {
    return null;
  }

  let grid = {
    type: "grid",
    cards,
  };

  if (column_span > 0) {
    grid["column_span"] = column_span;
  }

  return grid;
}

export function filterEntityKeysByDomain(obj, domain) {
  return Object.keys(obj)
    .filter((key) => key.startsWith(`${domain}.`))
    .reduce((acc, key) => {
      acc[key] = obj[key];
      return acc;
    }, {});
}

/**
 * Converts entities to an array if they are an object.
 *
 * @param {Array|Object|null|undefined} entities - An array, an object of entity objects, or null/undefined.
 * @returns {Array} - An array of entity objects (or an empty array if input is null/undefined).
 */
function convertEntitiesToArray(entities) {
  if (!entities) return []; // Handles null, undefined, and falsy values safely
  return Array.isArray(entities) ? entities : Object.values(entities);
}

/**
 * Filters entities based on their area ID.
 *
 * @param {Array|Object} entities - An array or an object of entity objects.
 * @param {string} areaId - The area ID to filter by.
 * @returns {Array} - A filtered array of entities that match the specified area ID.
 */
export function filterEntityByArea(entities, areaId, includeHidden = false) {
  let entityArray = convertEntitiesToArray(entities).filter(
    (entity) => entity.area_id === areaId
  );

  return includeHidden ? entityArray : remove_hidden(entityArray);
}

/**
 * Filters entities based on their platform.
 *
 * @param {Array|Object} entities - An array or an object of entity objects.
 * @param {string} platform - The platform name to filter by.
 * @returns {Array} - A filtered array of entities matching the platform.
 */
export function filterEntityByPlatform(entities, platform) {
  const entityArray = convertEntitiesToArray(entities);
  return entityArray.filter((entity) => entity.platform === platform);
}

/**
 * Alias for filterEntityByPlatform
 *
 * @function filterEntityByIntegration
 * @see filterEntityByPlatform
 */
export const filterEntityByIntegration = filterEntityByPlatform;

/**
 * Gets the value from a nested property (supports dot notation).
 *
 * @param {Object} obj - The object to retrieve the value from.
 * @param {string} path - The dot notation path to the property.
 * @returns {any} - The value at the specified path, or undefined if not found.
 */
function getNestedProperty(obj, path) {
  return path
    .split(".")
    .reduce((acc, part) => (acc ? acc[part] : undefined), obj);
}

/**
 * Filters entities based on multiple properties and values.
 *
 * @param {Array|Object} entities - An array or an object of entity objects.
 * @param {Object} filters - An object where keys are property names (or dot notation paths) and values are the values to filter by
 * @returns {Array} - A filtered array of entities that match the specified properties and values.
 *
 * @example
 * const entities = [
 *   { entity_id: 'sensor.living_room', attributes: { device_class: 'occupancy' }, platform: 'magic_areas' },
 *   { entity_id: 'sensor.kitchen', attributes: { device_class: 'temperature' }, platform: 'magic_areas' },
 *   { entity_id: 'sensor.bedroom', attributes: { device_class: 'occupancy' }, platform: 'magic_areas' }
 * ];
 *
 * const filters = {
 *   'attributes.device_class': 'occupancy', // Filtering based on a nested property
 *   platform: 'magic_areas' // Filtering based on a top-level property
 * };
 *
 * const filteredEntities = filterEntitiesByProperties(entities, filters);
 * console.log(filteredEntities);
 * // Output:
 * // [
 * //   { entity_id: 'sensor.living_room', attributes: { device_class: 'occupancy' }, platform: 'magic_areas' },
 * //   { entity_id: 'sensor.bedroom', attributes: { device_class: 'occupancy' }, platform: 'magic_areas' }
 * // ]
 */
export function filterEntitiesByProperties(entities, filters) {
  const entityArray = convertEntitiesToArray(entities);

  return entityArray.filter((entity) => {
    return Object.entries(filters).every(([path, value]) => {
      const entityValue = getNestedProperty(entity, path);
      return entityValue === value;
    });
  });
}

/**
 * Filters out `null` and `undefined` values from an array.
 *
 * This function creates a new array by filtering out any elements that are `null` or `undefined`.
 * It uses loose inequality (`!=`) to remove both `null` and `undefined` from the array,
 * while leaving all other values (including other falsy values like `false`, `0`, `''`, etc.) intact.
 *
 * @param {Array} arr - The array to filter.
 * @returns {Array} - A new array with `null` and `undefined` values removed.
 *
 * @example
 * const data = [1, null, 2, undefined, 3];
 * const result = filterFalsy(data);
 * console.log(result);  // Output: [1, 2, 3]
 */
function filterFalsy(arr) {
  return arr.filter((x) => x != null); // Will remove both null and undefined
}

export function alertBadge() {
  return {
    type: "custom:auto-entities",
    filter: {
      include: [
        {
          domain: "alert",
          state: "on",
          options: {
            type: "entity",
            content_info: "name",
            icon_color: "red",
          },
        },
      ],
      exclude: [],
    },
    show_empty: true,
    card_param: "chips",
    card: {
      type: "custom:mushroom-chips-card",
      alignment: "center",
    },
    grid_options: {
      columns: "full",
    },
    column_span: 12,
  };
}

/**
 * Wraps a given string inside an Immediately Invoked Function Expression (IIFE) as it would be accepted by Bubble Card's style property.
 *
 * @param {...string} js - One or more JavaScript statements to wrap inside an IIFE.
 * @returns {string} - A template literal string with the js enclosed in an IIFE.
 *
 */
export function wrapInBubbleCardStyleIIFE(...js) {
  return `
\${(() => {
  ${js.join(";\n  ")}
})()}
`;
}

/**
 * Generates a Home Assistant condition that ensures an entity is neither "unknown" nor "unavailable".
 *
 * This function creates an "and" condition block that checks whether the given entity's state
 * is neither "unknown" nor "unavailable". This is useful in automations, scripts, and Lovelace
 * configurations where you need to ensure an entity is in a valid state before proceeding.
 *
 * @param {object|string} entity - The entity object or entity ID to check.
 * @returns {object} - A Home Assistant condition object ensuring the entity is valid.
 *
 * @example
 * const condition = visibilityNotUnknownUnavailable("sensor.my_sensor");
 * console.log(condition);
 * // Output:
 * // {
 * //   "condition": "and",
 * //   "conditions": [
 * //     { "condition": "state", "entity": "sensor.my_sensor", "state_not": "unknown" },
 * //     { "condition": "state", "entity": "sensor.my_sensor", "state_not": "unavailable" }
 * //   ]
 * // }
 */
export function visibilityNotUnknownUnavailable(entity) {
  const entity_id = entity?.entity_id || entity;

  return {
    condition: "and",
    conditions: [
      {
        condition: "state",
        entity: entity_id,
        state_not: "unknown",
      },
      {
        condition: "state",
        entity: entity_id,
        state_not: "unavailable",
      },
    ],
  };
}

export function visibilityIsUnknownUnavailable(entity) {
  const entity_id = entity?.entity_id || entity;

  return {
    condition: "or",
    conditions: [
      {
        condition: "state",
        entity: entity_id,
        state: "unknown",
      },
      {
        condition: "state",
        entity: entity_id,
        state: "unavailable",
      },
    ],
  };
}

/**
 * Generates a JavaScript conditional statement to dynamically set a bubble card as large-2-rows vs just large.
 * You should set it as large then add this wrapped in an IIFE in styles
 *
 * @param {string} condition - The condition to evaluate inside the generated `if` statement. When true, will be large. When false will be large-2-rows
 * @returns {string} - A JavaScript conditional statement as a string.
 *
 * @example
 * const jsCode = styleConditional2Row("hass.states['person.name'].state === 'home'");
 * console.log(jsCode);
 * // Output:
 * // "if (hass.states['person.name'].state === 'home') {card.classList.remove('rows-2')} else {card.classList.add('rows-2')}"
 *
 * @example
 * helpers.wrapInBubbleCardStyleIIFE(helpers.bubbleStyleConditional2Row('window.innerWidth <= 768'))
 */
export function bubbleStyleConditional2Row(condition) {
  return `if (${condition}) {card.classList.add('rows-2')} else {card.classList.remove('rows-2')}`;
}

/**
 * Generates a JavaScript conditional statement to dynamically set a bubble card as large-2-rows vs just large.
 * You should set it as large then add this wrapped in an IIFE in styles
 *
 * @param {string} condition - The condition to evaluate inside the generated `if` statement. When true, will be large. When false will be large-2-rows
 * @returns {string} - A JavaScript conditional statement as a string.
 *
 * @example
 * const jsCode = styleConditional2Row("hass.states['person.name'].state === 'home'");
 * console.log(jsCode);
 * // Output:
 * // "if (hass.states['person.name'].state === 'home') {card.classList.remove('rows-2')} else {card.classList.add('rows-2')}"
 *
 * @example
 * helpers.wrapInBubbleCardStyleIIFE(helpers.bubbleStyleConditional2Row('window.innerWidth >= 768'))
 */
export function bubbleCSSImport() {
  return wrapInBubbleCardStyleIIFE(`
    if (!card.magicCSSAdded){
      card.magicCSSAdded = true

      // Create a <link> element inside the shadow root
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/local/strategies/magic-dashboard-strategy/animations.css?v=' + new Date().getTime();

      // Append the <link> element to the shadow root
      card.appendChild(link);
    }
    `);
}

// export const BUBBLE_MODULES = ['default', 'state_attribute', 'colorize', 'animate']
export const BUBBLE_MODULES = ["default", "state_attribute"];

export const CARD_MOD = {
  style: `
@import url('/hacsfiles/magic-dashboard-strategy/colorize.css');
@import url('/hacsfiles/magic-dashboard-strategy/animations.css');
    `,
};

export function AddCardMod(input) {
  if (input === undefined || input === null) {
    return;
  }

  // Detect array of sections
  if (Array.isArray(input)) {
    const tmp = input.filter((x) => x !== undefined && x !== null);
    if (tmp.length === 0) {
      return;
    }
    if (tmp[0].hasOwnProperty("cards")) {
      input.forEach((card) => {
        AddCardMod(card);
      });
      return;
    }
  }

  // Array of cards
  if (Array.isArray(input)) {
    input.forEach((card) => {
      if ((card !== undefined) & (card !== null)) {
        card["card_mod"] = CARD_MOD;
      }
    });
    return;
  }

  // Object that has cards
  if (input.hasOwnProperty("cards") && Array.isArray(input.cards)) {
    input.cards.forEach((card) => {
      if (card !== undefined && card !== null) {
        card["card_mod"] = CARD_MOD;
      }
    });
    return;
  }
}

/**
 * Filters out entities that are marked as hidden or disabled.
 *
 * This function removes any entities that have a non-null `hidden_by` or `disabled_by` property.
 *
 * @param {Array} entities - The array of entities to filter.
 * @returns {Array} A new array containing only the entities that are not hidden or disabled.
 */
export function remove_hidden(entities) {
  return entities.filter(
    (x) =>
      !(x.hasOwnProperty("hidden_by") && x.hidden_by !== null) &&
      !(x.hasOwnProperty("disabled_by") && x.disabled_by !== null)
  );
}
