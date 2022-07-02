// Taken from: https://stackoverflow.com/a/65556422
export const random = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);
export const delay = (ms: number) => new Promise((res) => setTimeout(res, random(ms - ms / 10, ms + ms / 10)));
