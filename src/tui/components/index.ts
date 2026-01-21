/**
 * SRCL-Inspired Components - Index
 *
 * Re-exports all components for easy importing
 */

// Theme and utilities
export * from "./theme.js";

// Panel/Card system
export * from "./panel.js";

// Data tables
export * from "./data-table.js";

// Menu system
export * from "./menu.js";

// Form components (export selectively to avoid conflicts)
export {
  renderTextInput,
  textInput,
  renderCheckboxes,
  checkboxes,
  renderRadios,
  radio,
  renderSelect,
  select,
  renderForm,
  confirm as formConfirm,
} from "./form.js";

export type {
  TextInputOptions,
  CheckboxOption,
  RadioOption,
  SelectOption,
  FormField,
  FormOptions,
} from "./form.js";

// Progress and loaders
export * from "./progress.js";

// Dialogs and alerts (export with aliases for clarity)
export {
  renderDialog,
  dialog,
  alertInfo,
  alertSuccess,
  alertWarning,
  alertError,
  alert,
  confirm as dialogConfirm,
  banner,
  toast,
} from "./dialog.js";

export type {
  DialogVariant,
  DialogOptions,
  AlertOptions,
  ConfirmOptions,
} from "./dialog.js";
