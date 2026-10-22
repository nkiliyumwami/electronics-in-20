import type { ModuleInfo } from './types.ts';

// The running project: "Plant Buddy", a battery-powered ESP32 plant monitor
// with a soil sensor, a temperature sensor, a status LED and a small pump.
export const MODULES: ModuleInfo[] = [
  { n: 1, title: 'Electricity your ESP32 runs on', blurb: 'Voltage, current and resistance, seen through the 3.3 V pins of an ESP32.' },
  { n: 2, title: 'Wiring circuits that work', blurb: 'Breadboards, jumper wires, GND, and the opens and shorts behind most "it doesn\'t work" moments.' },
  { n: 3, title: 'Inputs: reading the world', blurb: 'Buttons, the ADC, sensors and 5 V modules: getting clean readings into the ESP32.' },
  { n: 4, title: 'Outputs: making things happen', blurb: 'LEDs, PWM, and switching a pump or a relay without hurting the ESP32.' },
  { n: 5, title: 'Talking to sensors', blurb: 'Datasheets, I2C, UART and SPI: how modules and the ESP32 understand each other.' },
  { n: 6, title: 'Power for a device that lasts', blurb: 'USB, batteries, regulators, Wi-Fi bursts and deep sleep.' },
  { n: 7, title: 'From breadboard to a reliable device', blurb: 'Debugging, making it permanent, and staying safe.' },
];
