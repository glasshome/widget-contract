const BLANK_LETTERS = /[ㅤᅟᅠﾠ⠀]/gu;
const INVISIBLE = /[\p{Default_Ignorable_Code_Point}\s]/gu;

const LATIN = /\p{Script=Latin}/u;
const LOOKALIKE = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;

export function nameRefusal(value: string): "blank" | "mixed-script" | null {
  if (value.replace(BLANK_LETTERS, "").replace(INVISIBLE, "") === "") return "blank";
  for (const word of value.split(/\s+/u)) {
    if (LATIN.test(word) && LOOKALIKE.test(word)) return "mixed-script";
  }
  return null;
}
