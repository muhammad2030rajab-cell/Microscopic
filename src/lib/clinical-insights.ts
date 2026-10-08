/**
 * Clinical insights: reads the WHOLE report together and points the reviewer at patterns a single
 * result can't show (anemia type, Mentzer index, pancytopenia, thyroid patterns, eGFR stage, TSAT...).
 *
 * These are decision-support hints for the reviewing clinician, never a diagnosis. Wherever the
 * lab's own reference range matters (low Hb, high TSH...) we use the flag the report already computed,
 * so lab-specific ranges and age/sex ranges are respected. Hard cut-offs are used only where a
 * guideline defines them (diabetes, eGFR stages, triglycerides, platelet counts).
 *
 * Pure functions, no imports, unit-testable with plain node.
 */

export type InsightFlag = "normal" | "high" | "low" | "abnormal" | "unknown";
export type InsightLevel = "info" | "attention" | "urgent";

export interface InsightItem {
  name: string;
  categoryId?: string;
  /** Parsed numeric value, null when the result is not a number. */
  value: number | null;
  flag: InsightFlag;
  unit?: string;
}

export interface InsightInput {
  gender: "ذكر" | "أنثى";
  age: number | undefined;
  items: InsightItem[];
}

export interface Insight {
  id: string;
  level: InsightLevel;
  title: string;
  detail: string;
  /** The values the insight is based on, e.g. "Hemoglobin 9.1". */
  basis: string[];
}

const RANK: Record<InsightLevel, number> = { urgent: 0, attention: 1, info: 2 };
const maxLevel = (a: InsightLevel, b: InsightLevel): InsightLevel => (RANK[a] <= RANK[b] ? a : b);

export function analyzeInsights(input: InsightInput): Insight[] {
  const { gender, age, items } = input;
  const out: Insight[] = [];

  const find = (name: string, cat?: string) =>
    items.find((i) => i.name === name && i.value != null && (!cat || i.categoryId == null || i.categoryId === cat));
  const val = (name: string, cat?: string) => find(name, cat)?.value ?? null;
  const flag = (name: string, cat?: string): InsightFlag => find(name, cat)?.flag ?? "unknown";
  const mgdl = (name: string, cat?: string) => {
    const u = find(name, cat)?.unit;
    return !u || /mg/i.test(u);
  };
  const b = (name: string, cat?: string) => {
    const v = val(name, cat);
    return v == null ? null : `${name} ${v}`;
  };
  const add = (id: string, level: InsightLevel, title: string, detail: string, basis: (string | null)[]) =>
    out.push({ id, level, title, detail, basis: basis.filter((x): x is string => !!x) });

  // ---------- Blood count ----------
  const hb = val("Hemoglobin", "c3");
  const mcv = val("MCV", "c3");
  const rbc = val("RBCs", "c3");
  let plt = val("Platelets", "c3");
  if (plt != null && plt > 1500) plt /= 1000; // reported per µL instead of x10^3/µL
  const anemic = flag("Hemoglobin", "c3") === "low";
  const ferrFlag = flag("Ferritin", "c8");

  if (anemic) {
    const m = flag("MCV", "c3");
    if (m === "low") {
      const mentzer = mcv != null && rbc != null && rbc > 0 ? mcv / rbc : null;
      const parts: string[] = [];
      if (mentzer != null) {
        parts.push(`مؤشر منتزر = ${mentzer.toFixed(1)}: ${mentzer < 13 ? "أقل من 13 يرجّح سمة الثلاسيميا" : "أكبر من 13 يرجّح نقص الحديد"}.`);
      }
      if (ferrFlag === "low") parts.push("الفيريتين منخفض ويدعم نقص الحديد.");
      else if (ferrFlag !== "unknown") parts.push("الفيريتين غير منخفض، فيُراجَع احتمال الثلاسيميا أو أنيميا الأمراض المزمنة.");
      else parts.push("يُنصح بقياس الفيريتين ودراسة الحديد.");
      if (mentzer != null && mentzer < 13 && ferrFlag !== "low") parts.push("يُنصح بتفريد الهيموجلوبين (Hb electrophoresis).");
      add("anemia", "attention", "أنيميا صغيرة الكريات", parts.join(" "), [b("Hemoglobin", "c3"), b("MCV", "c3"), b("RBCs", "c3"), b("Ferritin", "c8")]);
    } else if (m === "high") {
      add("anemia", "attention", "أنيميا كبيرة الكريات", "يُنصح بفحص فيتامين B12 وحمض الفوليك ووظائف الغدة الدرقية والكبد، ومراجعة الأدوية والكحول.", [b("Hemoglobin", "c3"), b("MCV", "c3")]);
    } else if (m === "unknown") {
      add("anemia", "attention", "الهيموجلوبين منخفض", "أدخل MCV وRDW لتحديد نوع الأنيميا.", [b("Hemoglobin", "c3")]);
    } else {
      add("anemia", "attention", "أنيميا سوية الكريات", "يُنصح بعدّ الشبكيات (Reticulocytes) ومراجعة وظائف الكلى والفيريتين، مع التفكير في أنيميا الأمراض المزمنة أو نزف حديث.", [b("Hemoglobin", "c3"), b("MCV", "c3")]);
    }
  }

  if (anemic && flag("WBCs", "c3") === "low" && flag("Platelets", "c3") === "low") {
    add("pancytopenia", "urgent", "نقص في الخلايا الثلاثة (Pancytopenia)", "الهيموجلوبين والكرات البيضاء والصفائح كلها منخفضة. يُبلَّغ الطبيب، ويُنصح بصبغة دم محيطي واستشارة أمراض دم.", [b("Hemoglobin", "c3"), b("WBCs", "c3"), b("Platelets", "c3")]);
  }

  if (plt != null && plt < 20) {
    add("platelets", "urgent", "الصفائح منخفضة جدًا", "خطر نزف تلقائي. أعد التحليل وافحص الصبغة قبل الاعتماد، وأبلغ الطبيب فورًا.", [`Platelets ${plt}`]);
  } else if (plt != null && plt < 50) {
    add("platelets", "attention", "نقص شديد في الصفائح", "تأكد من عدم وجود تجمّع صفائح (EDTA clumping) بصبغة دم محيطي، وأعد العد على عينة سترات إن لزم.", [`Platelets ${plt}`]);
  }

  if (age != null && age >= 18 && hb != null && hb > (gender === "أنثى" ? 16 : 16.5)) {
    add("polycythemia", "attention", "ارتفاع الهيموجلوبين", "من الأسباب الجفاف والتدخين ونقص الأكسجة، وفي حال الاستمرار يُفكَّر في زيادة الكريات الحمراء الحقيقية (JAK2).", [b("Hemoglobin", "c3")]);
  }

  // ---------- Iron ----------
  const iron = val("Iron", "c8");
  const tibc = val("TIBC", "c8");
  const tsat = iron != null && tibc != null && tibc > 0 ? (iron / tibc) * 100 : null;
  if (ferrFlag === "low" || (tsat != null && tsat < 16)) {
    add("iron", anemic ? "info" : "attention", "نمط نقص الحديد",
      `${tsat != null ? `تشبّع الترانسفيرين = ${tsat.toFixed(0)}%. ` : ""}يُنصح بالبحث عن سبب النقص (نزف، سوء امتصاص، تغذية).`,
      [b("Ferritin", "c8"), b("Iron", "c8"), b("TIBC", "c8")]);
  }

  // ---------- Glucose ----------
  const fbs = mgdl("Fasting Glucose", "c5") ? val("Fasting Glucose", "c5") : null;
  const rbs = mgdl("Random Glucose", "c5") ? val("Random Glucose", "c5") : null;
  const a1c = val("HbA1c", "c5");
  {
    const lines: string[] = [];
    let level = "info" as InsightLevel; // widened: bump() reassigns it from a closure
    const bump = (l: InsightLevel) => (level = maxLevel(level, l));
    if (a1c != null) {
      if (a1c >= 6.5) { lines.push("HbA1c في مدى السكري."); bump("attention"); }
      else if (a1c >= 5.7) lines.push("HbA1c في مدى ما قبل السكري.");
      if (a1c >= 5.7) lines.push(`متوسط السكر التقديري حوالي ${Math.round(28.7 * a1c - 46.7)} mg/dL.`);
      if (anemic && a1c >= 5.7) lines.push("الأنيميا قد تؤثر على دقة HbA1c.");
    }
    if (fbs != null) {
      if (fbs >= 126) { lines.push("السكر الصائم في مدى السكري."); bump("attention"); }
      else if (fbs >= 100) lines.push("السكر الصائم في مدى ما قبل السكري.");
    }
    if (fbs != null && a1c != null && (fbs >= 126) !== (a1c >= 6.5)) lines.push("فيه عدم توافق بين السكر الصائم وHbA1c، راجع تحضير العينة أو أسباب تؤثر على HbA1c.");
    if (rbs != null && rbs >= 200) { lines.push("السكر العشوائي ≥ 200 mg/dL."); bump("attention"); }
    if (rbs != null && rbs >= 400) { lines.push("السكر العشوائي مرتفع جدًا، يُبلَّغ الطبيب فورًا."); bump("urgent"); }
    for (const g of [fbs, rbs]) if (g != null && g < 54) { lines.push("نقص شديد في السكر، يُبلَّغ الطبيب فورًا."); bump("urgent"); break; }
    if (lines.length) {
      if (level !== "urgent" && (a1c != null && a1c >= 6.5 || fbs != null && fbs >= 126)) lines.push("التشخيص يستلزم تأكيدًا بتحليل ثانٍ ما لم تكن هناك أعراض واضحة.");
      add("glycemia", level, "مؤشرات السكر", lines.join(" "), [b("Fasting Glucose", "c5"), b("Random Glucose", "c5"), b("HbA1c", "c5")]);
    }
  }

  // ---------- Lipids ----------
  if (mgdl("Triglycerides", "c4")) {
    const tg = val("Triglycerides", "c4");
    const ldl = val("LDL", "c4");
    const hdl = val("HDL", "c4");
    const lines: string[] = [];
    let level: InsightLevel = "info";
    if (tg != null && tg >= 500) { lines.push("الدهون الثلاثية ≥ 500: خطر التهاب البنكرياس، وتُعالَج أولًا."); level = "urgent"; }
    else if (tg != null && tg >= 200) { lines.push("الدهون الثلاثية مرتفعة."); level = "attention"; }
    if (ldl != null && ldl >= 190) { lines.push("LDL ≥ 190: يُنصح بتقييم فرط كوليسترول وراثي."); level = maxLevel(level, "attention"); }
    if (tg != null && hdl != null && hdl > 0 && tg / hdl >= 3) lines.push(`نسبة TG/HDL = ${(tg / hdl).toFixed(1)} (مؤشر مساعد على مقاومة الإنسولين).`);
    if (lines.length) add("lipids", level, "الدهون", lines.join(" "), [b("Triglycerides", "c4"), b("LDL", "c4"), b("HDL", "c4")]);
  }

  // ---------- Kidney ----------
  const egfr = val("eGFR");
  if (egfr != null && egfr < 60) {
    const stage = egfr >= 45 ? "G3a" : egfr >= 30 ? "G3b" : egfr >= 15 ? "G4" : "G5";
    add("egfr", egfr < 15 ? "urgent" : "attention", `eGFR في مرحلة ${stage}`, "التشخيص المزمن يستلزم استمرار الانخفاض 3 شهور أو أكثر مع تحليل بول ونسبة الألبومين/الكرياتينين.", [b("eGFR"), b("Creatinine", "c2")]);
  }
  const bun = val("BUN", "c2");
  const crea = val("Creatinine", "c2");
  if (bun != null && crea != null && crea > 0 && flag("BUN", "c2") === "high" && bun / crea > 20) {
    add("prerenal", "info", "نسبة BUN/Creatinine مرتفعة", `النسبة = ${(bun / crea).toFixed(0)}: قد تشير لجفاف أو نقص تروية الكلى أو نزف هضمي.`, [b("BUN", "c2"), b("Creatinine", "c2")]);
  }

  // ---------- Liver ----------
  const ast = val("SGOT (AST)", "c1");
  const alt = val("SGPT (ALT)", "c1");
  if ((ast != null && ast >= 200) || (alt != null && alt >= 200)) {
    add("liver-high", "attention", "ارتفاع شديد في إنزيمات الكبد", "أكثر من 5 أضعاف الحد الأعلى تقريبًا. يُنصح بفحص الفيروسات والأدوية والسموم.", [b("SGOT (AST)", "c1"), b("SGPT (ALT)", "c1")]);
  } else if (ast != null && alt != null && alt > 0 && ast > 40 && ast / alt > 2) {
    add("de-ritis", "info", "نسبة AST/ALT أكبر من 2", "نمط يُرى مع الكحول وأمراض الكبد المتقدمة أو إصابة العضلات.", [b("SGOT (AST)", "c1"), b("SGPT (ALT)", "c1")]);
  }

  // ---------- Thyroid ----------
  const tsh = flag("TSH", "c7");
  const ft4 = flag("Free T4", "c7");
  const ft3 = flag("Free T3", "c7");
  const tb = [b("TSH", "c7"), b("Free T4", "c7"), b("Free T3", "c7")];
  if (tsh === "high") {
    if (ft4 === "low") add("thyroid", "attention", "نمط قصور الغدة الدرقية الأولي", "TSH مرتفع مع Free T4 منخفض.", tb);
    else if (ft4 === "unknown") add("thyroid", "info", "TSH مرتفع", "يُنصح بإضافة Free T4 لاستكمال التقييم.", tb);
    else add("thyroid", "info", "نمط قصور تحت سريري", "TSH مرتفع مع Free T4 طبيعي. يُنصح بالإعادة بعد 6-8 أسابيع وفحص anti-TPO.", tb);
  } else if (tsh === "low") {
    if (ft4 === "high" || ft3 === "high") add("thyroid", "attention", "نمط فرط نشاط الغدة الدرقية", "TSH منخفض مع ارتفاع هرمونات الغدة.", tb);
    else if (ft4 === "unknown" && ft3 === "unknown") add("thyroid", "info", "TSH منخفض", "يُنصح بإضافة Free T4 وFree T3.", tb);
    else add("thyroid", "info", "نمط فرط نشاط تحت سريري", "TSH منخفض مع هرمونات طبيعية. يُنصح بالإعادة وتقييم الأسباب (أدوية، حمل، أمراض غير درقية).", tb);
  }

  return out.sort((x, y) => RANK[x.level] - RANK[y.level]);
}
