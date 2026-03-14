export interface MacroBandDef {
  frequency: number;
  q: number;
  gainScale: number; // How much the macro slider influences this band
}

export interface MacroSliderDef {
  id: string;
  label: string;
  bands: MacroBandDef[];
  value: number; // 0 to 2
}

export interface ModePreset {
  id: string;
  name: string;
  sliders: MacroSliderDef[];
}

export const defaultPresets: ModePreset[] = [
  {
    id: "musical",
    name: "Musical Instruments",
    sliders: [
      {
        id: "drums",
        label: "Drums (Kick/Snare)",
        value: 1.0,
        bands: [
          { frequency: 60, q: 2, gainScale: 1.0 },
          { frequency: 3000, q: 4, gainScale: 0.8 }
        ]
      },
      {
        id: "bass",
        label: "Bass",
        value: 1.0,
        bands: [
          { frequency: 100, q: 2, gainScale: 1.0 },
          { frequency: 250, q: 3, gainScale: 0.5 }
        ]
      },
      {
        id: "vocals",
        label: "Vocals",
        value: 1.0,
        bands: [
          { frequency: 1000, q: 5, gainScale: 1.0 },
          { frequency: 4000, q: 4, gainScale: 1.2 }
        ]
      },
      {
        id: "guitar",
        label: "Guitar",
        value: 1.0,
        bands: [
          { frequency: 400, q: 3, gainScale: 0.8 },
          { frequency: 2000, q: 5, gainScale: 1.0 }
        ]
      }
    ]
  },
  {
    id: "animal",
    name: "Animal Sounds",
    sliders: [
      {
        id: "dog",
        label: "Dog Bark",
        value: 1.0,
        bands: [{ frequency: 800, q: 2, gainScale: 1.0 }]
      },
      {
        id: "cat",
        label: "Cat Meow",
        value: 1.0,
        bands: [{ frequency: 1500, q: 3, gainScale: 1.0 }]
      },
      {
        id: "bird",
        label: "Bird Chirp",
        value: 1.0,
        bands: [{ frequency: 4500, q: 5, gainScale: 1.0 }]
      },
      {
        id: "cow",
        label: "Cow Moo",
        value: 1.0,
        bands: [{ frequency: 250, q: 2, gainScale: 1.0 }]
      }
    ]
  },
  {
    id: "human",
    name: "Human Voices",
    sliders: [
      {
        id: "male",
        label: "Adult Male",
        value: 1.0,
        bands: [{ frequency: 120, q: 2, gainScale: 1.0 }]
      },
      {
        id: "female",
        label: "Adult Female",
        value: 1.0,
        bands: [{ frequency: 220, q: 2, gainScale: 1.0 }]
      },
      {
        id: "child",
        label: "Child",
        value: 1.0,
        bands: [{ frequency: 300, q: 2, gainScale: 1.0 }]
      },
      {
        id: "elderly",
        label: "Elderly Rasp",
        value: 1.0,
        bands: [{ frequency: 100, q: 2, gainScale: 0.8 }, { frequency: 1500, q: 3, gainScale: 0.5 }]
      }
    ]
  },
  {
    id: "ecg",
    name: "ECG Abnormalities",
    sliders: [
      {
        id: "afib",
        label: "Atrial Fibrillation (AFib)",
        value: 1.0,
        bands: [{ frequency: 5, q: 4, gainScale: 1.0 }] // Pathological tremor frequencies (approx 4-10Hz)
      },
      {
        id: "vfib",
        label: "Ventricular Fib (VFib)",
        value: 1.0,
        bands: [{ frequency: 3, q: 4, gainScale: 1.0 }]
      },
      {
        id: "pvc",
        label: "PVC Premature",
        value: 1.0,
        bands: [{ frequency: 15, q: 2, gainScale: 1.0 }]
      },
      {
        id: "baseline",
        label: "Baseline Wander",
        value: 1.0,
        bands: [{ frequency: 0.5, q: 1, gainScale: 1.0 }] // extremely low freq
      }
    ]
  }
];
