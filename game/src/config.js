// Marisol Bay — shared constants, palette, story and mission definitions.
// One job: every tunable number and every word of the story lives here.

export const GAME_TITLE = 'Marisol Bay';
export const SAVE_KEY = 'marisol-bay-save-v1';

// Sun-soaked coastal palette (amber on deep navy, from the ui-ux-pro-max lookup).
export const PALETTE = {
  amber: 0xf59e0b, amberDeep: 0xd97706, navy: 0x0f172a, skyTop: 0x7ec8f7,
  skyHorizon: 0xffe3b3, sea: 0x2e86ab, sand: 0xe8d29a, grass: 0x7fb069,
  asphalt: 0x2f3542, sidewalk: 0x9aa5b1, white: 0xf8fafc,
};

export const WORLD = {
  half: 210,            // city extends -210..210 on x and z
  roadEvery: 42,        // grid spacing
  roadWidth: 12,
  beachZ: 168,          // sand starts here, sea beyond z = 196
  seaZ: 196,
  blockSize: 30,
};

export const PLAYER = {
  walkSpeed: 7, runSpeed: 12, accel: 42, radius: 0.9, maxHealth: 100, maxArmor: 100,
};

export const CAR = {
  maxSpeed: 34, accel: 16, brake: 30, reverseMax: 12, steer: 1.9, grip: 0.94,
};

// Story: Rae Marisol, a new courier in Marisol Bay. All names are original.
export const STORY = {
  hero: 'Rae Marisol',
  fixer: 'Mara Voss',
  cop: 'Chief Dario Kett',
  intro: 'Fresh off the ferry, empty pockets, one dead scooter. The Bay runs on favors.',
};

export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, rate: 0.45, range: 2.6, auto: false, ammo: Infinity },
  pistol: { name: 'Pistol', damage: 26, rate: 0.28, range: 70, auto: false, ammo: Infinity, mag: 12 },
  rifle: { name: 'Rifle', damage: 48, rate: 0.11, range: 110, auto: true, ammo: Infinity, mag: 30, price: 300 },
};

// Five story missions. Objective positions are open ground (never inside a building
// collider) and every radius is generous (>= 16) so a mission can always complete.
export const MISSIONS = [
  {
    id: 1, name: 'M1 · First Delivery', reward: 200, timeLimit: 200,
    brief: 'Mara Voss needs a package at the Marina — fast. Get to the yellow marker before the clock runs out.',
    steps: [
      { type: 'goto', text: 'Deliver the package to the Marina dock', pos: [150, 150], radius: 18 },
    ],
  },
  {
    id: 2, name: 'M2 · The Commission', reward: 350, timeLimit: 0,
    brief: 'A client wants the coral sports car parked by the plaza. Take it — and mind the owner.',
    steps: [
      { type: 'steal', text: 'Steal the coral Comet GT by the plaza', pos: [42, -42], radius: 16, carId: 'target' },
      { type: 'goto', text: 'Deliver the Comet GT to Voss Garage', pos: [-150, -84], radius: 18, needCar: true },
    ],
  },
  {
    id: 3, name: 'M3 · Gold Rush', reward: 600, timeLimit: 0,
    brief: 'The Goldline jewellers keep the safe open at noon. Walk in, hold the room, walk out rich.',
    steps: [
      { type: 'hold', text: 'Hold the Goldline shop floor — stay in the marker', pos: [-42, 42], radius: 16, holdTime: 10 },
      { type: 'goto', text: 'Lose the heat — reach the Hideout', pos: [-168, 126], radius: 18 },
    ],
  },
  {
    id: 4, name: 'M4 · Hot Streets', reward: 800, timeLimit: 0,
    brief: 'Kett’s crew is rolling. Run the three checkpoints through downtown while their shooters fire.',
    steps: [
      { type: 'goto', text: 'Checkpoint 1 — Sunset Boulevard', pos: [0, -126], radius: 18 },
      { type: 'goto', text: 'Checkpoint 2 — Palm Row', pos: [-126, -42], radius: 18 },
      { type: 'goto', text: 'Checkpoint 3 — Bay Bridge approach', pos: [-84, 126], radius: 18 },
    ],
  },
  {
    id: 5, name: 'M5 · Last Ferry Out', reward: 1500, timeLimit: 0,
    brief: 'Five stars. Every cruiser in the Bay is coming. Reach the pier helipad and fly out a legend.',
    steps: [
      { type: 'goto', text: 'Reach the Pier Helipad — wanted level 5', pos: [168, 168], radius: 20, wanted: 5 },
    ],
  },
];

export const SHOPS = {
  gun: { pos: [84, 42], name: 'Bay Arms', radius: 14 },
  garage: { pos: [-150, -84], name: 'Voss Garage', radius: 18 },
  hideout: { pos: [-168, 126], name: 'Hideout', radius: 18 },
  hospital: { pos: [-84, -168], name: 'Bay General', radius: 16 },
};

export const CAR_NAMES = ['Comet GT', 'Bay Cruiser', 'Palm Sedan', 'Marina Coupe', 'Surf Van', 'Dune Buggy'];
export const CAR_COLORS = [0xe85d75, 0x3b82f6, 0xf59e0b, 0x22c55e, 0xa855f7, 0xf8fafc, 0xef4444, 0x14b8a6];
