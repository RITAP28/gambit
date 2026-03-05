import type { AppDispatch } from "../redux/store";

let externalDispatch: AppDispatch;

export const setExternalDispatch = (fn: AppDispatch) => {
  externalDispatch = fn;
};

export const getDispatch = () => externalDispatch;