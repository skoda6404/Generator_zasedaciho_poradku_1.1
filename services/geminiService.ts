import { GoogleGenAI, Type } from "@google/genai";
import { SeatingChart } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const schema = {
  type: Type.OBJECT,
  properties: {
    seating: {
      type: Type.ARRAY,
      description: "A 2D array representing the classroom rows. Each row is an array of desks.",
      items: {
        type: Type.ARRAY,
        description: "A single row of desks.",
        items: {
            oneOf: [
                { type: Type.NULL }, // Represents '--' or no desk
                {
                  type: Type.ARRAY,
                  description: "A single desk with seats. Use a student's full name as a string for an occupied seat. Use null for an empty or blocked seat.",
                  items: {
                    oneOf: [
                      { type: Type.STRING },
                      { type: Type.NULL }
                    ]
                  },
                }
            ]
        }
      }
    },
    error: {
        type: Type.STRING,
        description: "If the conditions cannot be met or there's an issue, provide a brief, user-friendly error message in Czech here. Otherwise, this should be null.",
        nullable: true,
    }
  },
  required: ['seating', 'error']
};


export const generateSeatingArrangement = async (
  layoutMatrix: string,
  students: string[],
  conditions: string,
  numberedMatrix: string,
  currentArrangementMatrix: string | null // New parameter
): Promise<{ seating: SeatingChart | null; error: string | null }> => {
  const isModification = currentArrangementMatrix !== null;
  
  const modificationPrompt = `
    Jsi asistent pro úpravu zasedacích pořádků ve třídě. Tvým úkolem je upravit existující zasedací pořádek podle zadaného pokynu. Vždy vrať výsledek ve formátu JSON podle poskytnutého schématu.

    **Referenční očíslování lavic:**
    Abychom ti pomohli porozumět podmínkám jako "vyměň žáky v lavici č. 5", zde je rozložení s očíslovanými pozicemi lavic. Číslování (prefix 'L' jako "Lavice") jde od tabule dozadu (od první řady k poslední) a zleva doprava.
    \`\`\`
    ${numberedMatrix}
    \`\`\`

    **Aktuální zasedací pořádek:**
    Zde je aktuální rozložení žáků. V každé lavici jsou jména nebo volná místa uvedena v hranatých závorkách a oddělena čárkou.
    - \`[prázdná]\` označuje zcela volnou lavici (např. jednomístnou).
    - Uvnitř vícemístné lavice označuje slovo \`'prázdné'\` konkrétní volné místo k sezení, které je k dispozici pro obsazení. Například \`[Jméno, prázdné]\` znamená, že levé místo je obsazené a pravé je volné a lze na něj někoho posadit.
    \`\`\`
    ${currentArrangementMatrix}
    \`\`\`
    
    **Seznam všech žáků ve třídě (pro referenci):**
    \`\`\`
    ${students.join('\n')}
    \`\`\`

    **Pokyn k úpravě:**
    \`\`\`
    ${conditions}
    \`\`\`

    **Tvůj úkol:**
    1. Pečlivě analyzuj pokyn k úpravě. Použij referenční matici pro pochopení čísel lavic. Okna jsou vpravo, dveře vlevo.
    2. Uprav zasedací pořádek podle pokynu. Můžeš vyměňovat žáky, přesouvat je na volná místa, nebo dokonce přidávat nové žáky, pokud je to v pokynu.
    3. Pokud nelze pokyn splnit, vyplň pole 'error' s krátkým vysvětlením v češtině. Jinak ponech 'error' jako null.
    4. Vrať **KOMPLETNÍ** nový zasedací pořádek jako 2D pole v JSON v poli 'seating'. Struktura výstupního pole 'seating' musí přesně odpovídat struktuře původního rozložení třídy (matice níže). Pořadí řádků ve výstupu musí být stejné jako v zadaném rozložení.

    **NEJDŮLEŽITĚJŠÍ PRAVIDLA PRO ÚPRAVY:**
    Tvým jediným úkolem je provést **VÝHRADNĚ** změny, které jsou explicitně vyžadovány v pokynu. NIC VÍC.
    - **NEPŘESOUVEJ** žádné jiné žáky, kteří nejsou zmíněni v pokynu.
    - **NEVYPLŇUJ** volná místa, pokud to není součást pokynu.
    - **NEMĚŇ** pozice žáků v rámci lavice (např. z levého na pravé místo), pokud to není v pokynu.
    - **SPECIÁLNÍ POKYN PRO ZACHOVÁNÍ POZIC:** Když přesouváš žáka z vícemístné lavice a jeho soused v lavici zůstává, je **ABSOLUTNĚ KLÍČOVÉ**, aby zbývající žák zůstal na svém původním místě (levém nebo pravém). Ve výstupním JSONu to znamená, že na uvolněné místo musíš vložit \`null\`. Například, pokud je původní stav \`["Petr Novák", "Anna Svobodová"]\` a pokyn zní 'přesuň Petra Nováka', výsledná lavice musí být \`[null, "Anna Svobodová"]\`. **NESMÍŠ** ji změnit na \`["Anna Svobodová", null]\` ani ji nijak zkrátit.
    - Všechny ostatní žáky a volná místa (označená jako 'prázdné') musí zůstat na svých původních pozicích. Vrať kompletní zasedací pořádek, kde je aplikovaná POUZE požadovaná změna. Pokud máš pochybnosti, neměň nic navíc.
    
    Původní rozložení pro strukturu výstupu:
    \`\`\`
    ${layoutMatrix}
    \`\`\`
  `;

  const generationPrompt = `
    Jsi asistent pro vytváření zasedacích pořádků ve třídě. Tvým úkolem je rozsadit dané žáky do lavic podle zadaného rozložení a podmínek. Vždy vrať výsledek ve formátu JSON podle poskytnutého schématu.

    **Rozložení třídy a číslování řad:**
    - Tabule je na spodní straně.
    - Řady lavic se číslují od tabule směrem dozadu. "První řada" je tedy ta nejblíže k tabuli (dole na vizualizaci). "Poslední řada" je nejdále od tabule (nahoře na vizualizaci).
    - **DŮLEŽITÉ:** Vstupní matice rozložení, kterou dostaneš, je zapsána z pohledu od tabule směrem dozadu. To znamená, že **první řádek textu v matici odpovídá poslední řadě lavic** (úplně vzadu) a **poslední řádek textu v matici odpovídá první řadě lavic** (úplně vepředu u tabule).
    - Příklad: Pokud uživatel řekne "posaď Petra do první řady", musíš ho umístit do lavice definované v POSLEDNÍM řádku matice rozložení.

    **Referenční očíslování lavic:**
    Abychom ti pomohli porozumět podmínkám jako "posaď žáka do lavice č. 5", zde je stejné rozložení, ale s očíslovanými pozicemi lavic. Číslování (prefix 'L' jako "Lavice") jde od tabule dozadu (od první řady k poslední) a zleva doprava. Použij toto očíslování k interpretaci podmínek uživatele. Výstupní formát JSON musí stále vycházet z původní, nečíslované matice rozložení.
    \`\`\`
    ${numberedMatrix}
    \`\`\`

    **Definice symbolů pro lavice (vstupní matice):**
    - Řetězec číslic '1' a '0' definuje lavici. Počet míst k sezení se řídí počtem '1'. Pokud v řetězci není žádná '1', pak se počet míst řídí počtem '0'. '0' v přítomnosti '1' značí blokované místo.
      - Např. \`1\` je jednomístná lavice. \`11\` je dvojlavice. \`111\` je trojlavice.
      - \`101\` je trojlavice, kde prostřední místo je blokované a nelze ho obsadit.
      - \`00\` je dvojlavice (z důvodu zpětné kompatibility).
    - \`--\`: Místo bez lavice, sem nelze nikoho usadit.

    Zde je rozložení, se kterým máš pracovat pro výstup:
    \`\`\`
    ${layoutMatrix}
    \`\`\`

    **Seznam žáků:**
    \`\`\`
    ${students.join('\n')}
    \`\`\`

    **Podmínky pro rozmístění:**
    \`\`\`
    ${conditions}
    \`\`\`

    **Tvůj úkol:**
    1. Pečlivě analyzuj podmínky. Okna jsou vpravo, dveře vlevo při pohledu od tabule. Pro interpretaci čísel lavic použij referenční očíslovanou matici. Pamatuj na správné číslování řad, jak je popsáno výše (první řada = poslední řádek v matici).
    2. Rozsaď všechny žáky ze seznamu do dostupných míst v lavicích.
    3. Pokud nelze podmínky splnit nebo je nedostatek míst, vyplň pole 'error' s krátkým vysvětlením v češtině. Jinak ponech 'error' jako null.
    4. Vrať výsledek jako 2D pole v JSON v poli 'seating'. Vnější pole reprezentuje řady. Vnitřní pole reprezentuje lavice v řadě.
       - Pro místo bez lavice (\`--\`) použij \`null\` na pozici lavice v řadě.
       - Pro lavici (např. \`1\`, \`11\`, \`101\`) použij pole prvků, kde délka pole odpovídá počtu znaků v definici lavice. Na místa, která lze obsadit (\`1\` nebo \`0\` v kódech jako \`00\`), umísti jméno žáka nebo \`null\`, pokud je místo volné. Na blokovaná místa (např. prostřední pozice v \`101\`) umísti vždy \`null\`.
         - Příklad pro \`1\`: \`["Novák Petr"]\`.
         - Příklad pro \`11\`: \`["Novák Petr", "Svobodová Anna"]\`.
         - Příklad pro \`101\`: \`["Novák Petr", null, "Svobodová Anna"]\`.
       - **DŮLEŽITÉ:** Struktura výstupního pole 'seating' musí přesně odpovídat struktuře vstupního rozložení (stejný počet řad a lavic v každé řadě). Pořadí řádků ve výstupu musí být stejné jako v zadaném rozložení. První řádek výstupu odpovídá prvnímu řádku vstupu (poslední řada).

    Příklad výstupu pro rozložení \`1,11\`: \`{"seating": [ [ ["Žák A"], ["Žák B", "Žák C"] ] ], "error": null}\`
    `;
    
  const prompt = isModification ? modificationPrompt : generationPrompt;

  try {
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: schema,
        },
    });
    
    const jsonText = response.text.trim();
    const parsed = JSON.parse(jsonText);
    
    if (parsed.error) {
        return { seating: null, error: parsed.error };
    }

    // Basic validation of the returned structure
    if (!parsed.seating || !Array.isArray(parsed.seating)) {
      throw new Error("AI vrátilo neplatný formát dat (chybí pole 'seating').");
    }

    return { seating: parsed.seating as SeatingChart, error: null };
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return { seating: null, error: "Při komunikaci s AI službou nastala chyba. Zkuste to prosím znovu." };
  }
};