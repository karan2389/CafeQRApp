export const STORAGE_KEY = "ember-oak-demo-state-v1";
export const CHANNEL_NAME = "ember-oak-demo-channel-v1";

export const CART_STORAGE_PREFIX = "ember-oak-cart-";
export const PUFFS_CONFIRMED_STORAGE_KEY = "ember-oak-puffs-confirmed";
export const SOUND_ENABLED_STORAGE_KEY = "ember-oak-sound-enabled";

export const LIMITS = {
  MIN_CUSTOMER_NAME_LENGTH: 2,
  MAX_CUSTOMER_NAME_LENGTH: 50,
  MAX_KITCHEN_NOTE_LENGTH: 160,
  MAX_ITEM_QUANTITY: 10,
  STAFF_CALL_COOLDOWN_SECONDS: 20,
} as const;
