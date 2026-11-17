// A tiny seeded random generator (mulberry32) so a mile layout, a deck and a
// screenshot scene are the same every time for the same seed.

export function createRandom(seed) {
  let a = seed >>> 0;
  return {
    /** Next float in [0, 1). */
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** Next integer in [min, max] inclusive. */
    int(min, max) {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    /** Pick one element of an array. */
    pick(array) {
      return array[Math.floor(this.next() * array.length)];
    },
    /** Shuffle an array in place (Fisher-Yates) and return it. */
    shuffle(array) {
      for (let i = array.length - 1; i > 0; i -= 1) {
        const j = Math.floor(this.next() * (i + 1));
        const tmp = array[i];
        array[i] = array[j];
        array[j] = tmp;
      }
      return array;
    },
  };
}
