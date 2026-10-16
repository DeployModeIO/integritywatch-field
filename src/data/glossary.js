/* IntegrityWatch Field — glossary
   Multilingual technical glossary (53 terms across 6 categories, 7 locales).
   API: terms, byCategory(cat), search(query, locale). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.data = root.IW.data || {};
  root.IW.data.glossary = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var LOCALES = ['en', 'es', 'fr', 'zh', 'ru', 'ar', 'pt'];
  var CATEGORIES = ['corrosion', 'psv', 'pipeline', 'apm', 'standards', 'data'];

  var terms = [
    {
      id: 'corrosion-rate',
      category: 'corrosion',
      standard: 'NACE/AMPP SP0775',
      i18n: {
        en: { term: 'Corrosion rate', definition: 'Rate of metal loss per unit time, typically reported in mpy (mils per year) or mm/year. It is the primary quantity estimated from coupons, ER probes and LPR readings.' },
        es: { term: 'Velocidad de corrosión', definition: 'Pérdida de metal por unidad de tiempo, expresada habitualmente en mpy (milésimas de pulgada por año) o mm/año. Es la magnitud principal estimada a partir de cupones, sondas ER y lecturas LPR.' },
        fr: { term: 'Vitesse de corrosion', definition: "Perte de métal par unité de temps, généralement exprimée en mpy (millièmes de pouce par an) ou en mm/an. C'est la grandeur principale estimée à partir des coupons, des sondes ER et des mesures LPR." },
        zh: { term: '腐蚀速率', definition: '单位时间内的金属损失量，通常以 mpy（密耳/年）或 mm/年表示。它是通过挂片、ER 探针和 LPR 读数估算的主要量。' },
        ru: { term: 'Скорость коррозии', definition: 'Потеря металла в единицу времени, обычно выражается в mpy (мил/год) или мм/год. Основная величина, оцениваемая по купонам, датчикам ER и измерениям LPR.' },
        ar: { term: 'معدل التآكل', definition: 'مقدار فقدان المعدن في وحدة الزمن، ويعبَّر عنه عادةً بوحدة mpy (جزء من الألف من البوصة في السنة) أو مم/سنة. وهو الكمية الأساسية المقدَّرة من الكوبونات ومجسّات ER وقراءات LPR.' },
        pt: { term: 'Taxa de corrosão', definition: 'Perda de metal por unidade de tempo, normalmente expressa em mpy (milésimos de polegada por ano) ou mm/ano. É a grandeza principal estimada a partir de cupons, sondas ER e leituras de LPR.' }
      }
    },
    {
      id: 'coupon-gravimetric',
      category: 'corrosion',
      standard: 'NACE/AMPP SP0775',
      i18n: {
        en: { term: 'Gravimetric coupon', definition: 'A weighed metal specimen exposed to the process fluid; weight loss over the exposure period is converted to an average corrosion rate. The reference method defined in SP0775.' },
        es: { term: 'Cupón gravimétrico', definition: 'Probeta metálica pesada y expuesta al fluido de proceso; la pérdida de peso durante el periodo de exposición se convierte en una velocidad de corrosión promedio. Método de referencia definido en SP0775.' },
        fr: { term: 'Coupon gravimétrique', definition: "Éprouvette métallique pesée puis exposée au fluide de procédé; la perte de masse sur la période d'exposition est convertie en vitesse de corrosion moyenne. Méthode de référence définie par la SP0775." },
        zh: { term: '失重挂片', definition: '称重后暴露于工艺流体中的金属试片；根据暴露期间的失重换算为平均腐蚀速率。SP0775 定义的基准方法。' },
        ru: { term: 'Гравиметрический купон', definition: 'Взвешенный металлический образец, экспонируемый в технологической среде; потеря массы за период экспозиции пересчитывается в среднюю скорость коррозии. Эталонный метод по SP0775.' },
        ar: { term: 'الكوبون الوزني', definition: 'عينة معدنية موزونة تُعرَّض لسائل العملية؛ ويُحوَّل فقدان الوزن خلال فترة التعريض إلى معدل تآكل وسطي. وهي الطريقة المرجعية المعرَّفة في SP0775.' },
        pt: { term: 'Cupom gravimétrico', definition: 'Corpo de prova metálico pesado e exposto ao fluido de processo; a perda de massa ao longo do período de exposição é convertida em taxa de corrosão média. Método de referência definido na SP0775.' }
      }
    },
    {
      id: 'er-probe',
      category: 'corrosion',
      standard: 'NACE/AMPP SP0775',
      i18n: {
        en: { term: 'Electrical resistance (ER) probe', definition: 'A probe whose sensing element increases in resistance as it corrodes; the resistance change yields a real-time metal-loss rate without retrieving the element.' },
        es: { term: 'Sonda de resistencia eléctrica (ER)', definition: 'Sonda cuyo elemento sensor aumenta su resistencia eléctrica a medida que se corroe; la variación de resistencia proporciona una tasa de pérdida de metal en tiempo real sin retirar el elemento.' },
        fr: { term: 'Sonde de résistance électrique (ER)', definition: "Sonde dont l'élément sensible voit sa résistance augmenter à mesure qu'il se corrode; la variation de résistance donne une vitesse de perte de métal en temps réel sans retirer l'élément." },
        zh: { term: '电阻（ER）探针', definition: '其敏感元件随腐蚀而电阻增大的探针；电阻的变化可在不取出元件的情况下实时给出金属损失速率。' },
        ru: { term: 'Датчик электрического сопротивления (ER)', definition: 'Датчик, чувствительный элемент которого увеличивает сопротивление по мере коррозии; изменение сопротивления даёт скорость потери металла в реальном времени без извлечения элемента.' },
        ar: { term: 'مجسّ المقاومة الكهربائية (ER)', definition: 'مجسّ يزداد عنصر الاستشعار فيه مقاومةً كلما تآكل؛ ويعطي تغيّر المقاومة معدل فقدان المعدن لحظياً دون إخراج العنصر.' },
        pt: { term: 'Sonda de resistência elétrica (ER)', definition: 'Sonda cujo elemento sensor aumenta de resistência conforme corrói; a variação de resistência fornece a taxa de perda de metal em tempo real sem remover o elemento.' }
      }
    },
    {
      id: 'lpr',
      category: 'corrosion',
      standard: 'NACE/AMPP SP0775',
      i18n: {
        en: { term: 'Linear polarization resistance (LPR)', definition: 'An electrochemical technique that applies a small potential around the free corrosion potential; the resulting current yields an instantaneous corrosion rate.' },
        es: { term: 'Resistencia de polarización lineal (LPR)', definition: 'Técnica electroquímica que aplica un pequeño potencial en torno al potencial libre de corrosión; la corriente resultante permite obtener una velocidad de corrosión instantánea.' },
        fr: { term: 'Résistance de polarisation linéaire (LPR)', definition: "Technique électrochimique qui applique un faible potentiel autour du potentiel libre de corrosion; le courant résultant donne une vitesse de corrosion instantanée." },
        zh: { term: '线性极化电阻（LPR）', definition: '一种在自由腐蚀电位附近施加微小电位的电化学技术；由此产生的电流可给出瞬时腐蚀速率。' },
        ru: { term: 'Линейное поляризационное сопротивление (LPR)', definition: 'Электрохимический метод, при котором вблизи потенциала свободной коррозии прикладывается малое смещение; результирующий ток даёт мгновенную скорость коррозии.' },
        ar: { term: 'مقاومة الاستقطاب الخطي (LPR)', definition: 'تقنية كهروكيميائية تطبّق جهداً صغيراً حول جهد التآكل الحر؛ ويعطي التيار الناتج معدل تآكل لحظياً.' },
        pt: { term: 'Resistência de polarização linear (LPR)', definition: 'Técnica eletroquímica que aplica um pequeno potencial em torno do potencial livre de corrosão; a corrente resultante fornece uma taxa de corrosão instantânea.' }
      }
    },
    {
      id: 'hydrogen-probe',
      category: 'corrosion',
      standard: 'NACE/AMPP SP0775',
      i18n: {
        en: { term: 'Hydrogen probe', definition: 'A device that measures atomic hydrogen permeating through the steel wall, indicating the intensity of hydrogen-driven damage mechanisms such as HIC or SSC.' },
        es: { term: 'Sonda de hidrógeno', definition: 'Dispositivo que mide el hidrógeno atómico que permea a través de la pared de acero, indicando la intensidad de mecanismos de daño por hidrógeno como HIC o SSC.' },
        fr: { term: 'Sonde à hydrogène', definition: "Dispositif mesurant l'hydrogène atomique qui traverse la paroi d'acier, indiquant l'intensité des mécanismes d'endommagement par l'hydrogène tels que HIC ou SSC." },
        zh: { term: '氢探针', definition: '测量穿过钢壁的原子氢的装置，用于指示 HIC 或 SSC 等氢致损伤机制的强度。' },
        ru: { term: 'Водородный датчик', definition: 'Устройство, измеряющее атомарный водород, проникающий через стальную стенку; указывает интенсивность водородных механизмов повреждения, таких как HIC или SSC.' },
        ar: { term: 'مجسّ الهيدروجين', definition: 'جهاز يقيس الهيدروجين الذري النافذ عبر جدار الفولاذ، مما يدل على شدة آليات التلف الهيدروجيني مثل HIC أو SSC.' },
        pt: { term: 'Sonda de hidrogênio', definition: 'Dispositivo que mede o hidrogênio atômico que permeia a parede de aço, indicando a intensidade de mecanismos de dano por hidrogênio como HIC ou SSC.' }
      }
    },
    {
      id: 'inhibitor-efficiency',
      category: 'corrosion',
      standard: 'NACE/AMPP SP0775',
      i18n: {
        en: { term: 'Inhibitor efficiency', definition: 'Percentage reduction in corrosion rate attributable to a corrosion inhibitor, computed as (uninhibited − inhibited) ÷ uninhibited × 100%.' },
        es: { term: 'Eficiencia del inhibidor', definition: 'Reducción porcentual de la velocidad de corrosión atribuible a un inhibidor, calculada como (sin inhibir − inhibida) ÷ sin inhibir × 100%.' },
        fr: { term: "Efficacité de l'inhibiteur", definition: "Réduction en pourcentage de la vitesse de corrosion attribuable à un inhibiteur, calculée par (non inhibée − inhibée) ÷ non inhibée × 100 %." },
        zh: { term: '缓蚀剂效率', definition: '缓蚀剂引起的腐蚀速率降低百分比，计算为（未加缓蚀剂 − 加缓蚀剂）÷ 未加缓蚀剂 × 100%。' },
        ru: { term: 'Эффективность ингибитора', definition: 'Процентное снижение скорости коррозии за счёт ингибитора, вычисляемое как (без ингибитора − с ингибитором) ÷ без ингибитора × 100%.' },
        ar: { term: 'كفاءة المثبّط', definition: 'النسبة المئوية لانخفاض معدل التآكل الناتج عن مثبّط التآكل، وتُحسب كالتالي: (بدون تثبيط − مع تثبيط) ÷ بدون تثبيط × 100%.' },
        pt: { term: 'Eficiência do inibidor', definition: 'Redução percentual da taxa de corrosão atribuível a um inibidor, calculada como (sem inibição − com inibição) ÷ sem inibição × 100%.' }
      }
    },
    {
      id: 'residual-inhibitor',
      category: 'corrosion',
      standard: 'NACE/AMPP SP0775',
      i18n: {
        en: { term: 'Residual inhibitor concentration', definition: 'Concentration of corrosion inhibitor remaining in the fluid after dosing, measured to confirm the dose is sufficient to maintain protection.' },
        es: { term: 'Concentración residual de inhibidor', definition: 'Concentración de inhibidor de corrosión que permanece en el fluido tras la dosificación, medida para confirmar que la dosis es suficiente para mantener la protección.' },
        fr: { term: "Concentration résiduelle d'inhibiteur", definition: "Concentration d'inhibiteur restant dans le fluide après dosage, mesurée pour confirmer que la dose est suffisante pour maintenir la protection." },
        zh: { term: '缓蚀剂残余浓度', definition: '加注后残留在流体中的缓蚀剂浓度，通过测量确认剂量足以维持防护。' },
        ru: { term: 'Остаточная концентрация ингибитора', definition: 'Концентрация ингибитора, остающаяся в среде после дозирования; измеряется для подтверждения достаточности дозы для поддержания защиты.' },
        ar: { term: 'التركيز المتبقي للمثبّط', definition: 'تركيز مثبّط التآكل المتبقي في السائل بعد الجرعات، ويُقاس للتأكد من أن الجرعة كافية للحفاظ على الحماية.' },
        pt: { term: 'Concentração residual de inibidor', definition: 'Concentração de inibidor de corrosão remanescente no fluido após a dosagem, medida para confirmar que a dose é suficiente para manter a proteção.' }
      }
    },
    {
      id: 'bsw',
      category: 'corrosion',
      standard: 'API MPMS',
      i18n: {
        en: { term: 'BSW (basic sediment and water)', definition: 'Volume fraction of water and sediment in a produced crude stream, expressed as a percentage; a key input to water-cut and corrosion assessments.' },
        es: { term: 'BSW (agua y sedimentos básicos)', definition: 'Fracción volumétrica de agua y sedimentos en una corriente de crudo producido, expresada en porcentaje; insumo clave para evaluaciones de corte de agua y corrosión.' },
        fr: { term: 'BSW (sédiments et eau de base)', definition: "Fraction volumique d'eau et de sédiments dans un brut produit, exprimée en pourcentage; donnée clé pour les évaluations de teneur en eau et de corrosion." },
        zh: { term: 'BSW（基础沉积物和水分）', definition: '采出原油中水和沉积物的体积分数，以百分比表示；是含水率和腐蚀评估的关键输入。' },
        ru: { term: 'BSW (вода и осадок)', definition: 'Объёмная доля воды и осадка в потоке добытой нефти, выраженная в процентах; ключевой параметр для оценки обводнённости и коррозии.' },
        ar: { term: 'BSW (الماء والرواسب الأساسية)', definition: 'الحصة الحجمية من الماء والرواسب في تيار النفط الخام المنتَج، معبَّر عنها بالنسبة المئوية؛ وهي مدخل أساسي لتقديرات نسبة الماء والتآكل.' },
        pt: { term: 'BSW (água e sedimentos básicos)', definition: 'Fração volumétrica de água e sedimentos em uma corrente de óleo bruto produzido, expressa em porcentagem; entrada-chave para avaliações de corte de água e corrosão.' }
      }
    },
    {
      id: 'sweet-corrosion',
      category: 'corrosion',
      standard: 'NACE/AMPP SP0775',
      i18n: {
        en: { term: 'Sweet corrosion', definition: 'Carbon dioxide (CO2) driven corrosion in the absence of significant hydrogen sulfide; typically presents as general metal loss or mesa attack.' },
        es: { term: 'Corrosión dulce', definition: 'Corrosión inducida por dióxido de carbono (CO2) en ausencia de sulfuro de hidrógeno significativo; se manifiesta como pérdida general de metal o ataque en meseta.' },
        fr: { term: 'Corrosion douce', definition: "Corrosion induite par le dioxyde de carbone (CO2) en l'absence de sulfure d'hydrogène significatif; se présente comme une perte générale de métal ou une attaque en mesa." },
        zh: { term: '甜性腐蚀（CO2 腐蚀）', definition: '在无明显硫化氢的情况下由二氧化碳（CO2）驱动的腐蚀；通常表现为全面金属损失或台地状腐蚀。' },
        ru: { term: 'Углекислотная (sweet) коррозия', definition: 'Коррозия под действием углекислого газа (CO2) при отсутствии значимого сероводорода; проявляется как общая потеря металла или меза-коррозия.' },
        ar: { term: 'التآكل الحلو', definition: 'تآكل مدفوع بثاني أكسيد الكربون (CO2) في غياب كبريتيد الهيدروجين بكميات مؤثرة؛ ويظهر عادةً كفقدان عام للمعدن أو هجوم ميزا.' },
        pt: { term: 'Corrosão doce', definition: 'Corrosão induzida por dióxido de carbono (CO2) na ausência de sulfeto de hidrogênio significativo; apresenta-se como perda geral de metal ou ataque em mesa.' }
      }
    },
    {
      id: 'sour-service',
      category: 'corrosion',
      standard: 'MR0175/ISO 15156',
      i18n: {
        en: { term: 'Sour service', definition: 'Service conditions where the fluid contains hydrogen sulfide (H2S) capable of causing sulfide stress cracking (SSC); material selection is governed by MR0175/ISO 15156.' },
        es: { term: 'Servicio ácido (sour)', definition: 'Condiciones de servicio donde el fluido contiene sulfuro de hidrógeno (H2S) capaz de causar agrietamiento por sulfuros (SSC); la selección de materiales se rige por MR0175/ISO 15156.' },
        fr: { term: 'Service acide (sour)', definition: "Conditions de service où le fluide contient du sulfure d'hydrogène (H2S) susceptible de provoquer une fissuration par sulfures (SSC); le choix des matériaux est régi par MR0175/ISO 15156." },
        zh: { term: '酸性服役（含硫）', definition: '流体中含有足以引起硫化物应力开裂（SSC）的硫化氢（H2S）的服役条件；材料选择受 MR0175/ISO 15156 约束。' },
        ru: { term: 'Сернистая (sour) среда', definition: 'Условия эксплуатации, при которых среда содержит сероводород (H2S), способный вызвать сульфидное растрескивание (SSC); выбор материалов регулируется MR0175/ISO 15156.' },
        ar: { term: 'الخدمة الحامضية (sour)', definition: 'ظروف خدمة يحتوي فيها السائل على كبريتيد الهيدروجين (H2S) بكمية قادرة على إحداث التشقق الكبريتيدي (SSC)؛ ويخضع اختيار المواد للمواصفة MR0175/ISO 15156.' },
        pt: { term: 'Serviço ácido (sour)', definition: 'Condições de serviço em que o fluido contém sulfeto de hidrogênio (H2S) capaz de causar trinca por sulfeto (SSC); a seleção de materiais é regida pela MR0175/ISO 15156.' }
      }
    },
    {
      id: 'ph2s',
      category: 'corrosion',
      standard: 'MR0175/ISO 15156',
      i18n: {
        en: { term: 'pH2S (H2S partial pressure)', definition: 'Partial pressure of hydrogen sulfide in the gas phase, commonly in psia or kPa; the sour-service threshold in MR0175/ISO 15156 is expressed through pH2S.' },
        es: { term: 'pH2S (presión parcial de H2S)', definition: 'Presión parcial del sulfuro de hidrógeno en la fase gaseosa, normalmente en psia o kPa; el umbral de servicio ácido en MR0175/ISO 15156 se expresa mediante pH2S.' },
        fr: { term: 'pH2S (pression partielle de H2S)', definition: "Pression partielle du sulfure d'hydrogène en phase gazeuse, généralement en psia ou kPa; le seuil de service acide de MR0175/ISO 15156 s'exprime par la pH2S." },
        zh: { term: 'pH2S（H2S 分压）', definition: '气相中硫化氢的分压，通常以 psia 或 kPa 表示；MR0175/ISO 15156 中的酸性服役阈值通过 pH2S 表达。' },
        ru: { term: 'pH2S (парциальное давление H2S)', definition: 'Парциальное давление сероводорода в газовой фазе, обычно в psia или кПа; порог сернистой среды в MR0175/ISO 15156 выражается через pH2S.' },
        ar: { term: 'pH2S (الضغط الجزئي لـ H2S)', definition: 'الضغط الجزئي لكبريتيد الهيدروجين في الطور الغازي، ويُعبَّر عنه عادةً بوحدة psia أو kPa؛ ويُعبَّر عن عتبة الخدمة الحامضية في MR0175/ISO 15156 من خلال pH2S.' },
        pt: { term: 'pH2S (pressão parcial de H2S)', definition: 'Pressão parcial do sulfeto de hidrogênio na fase gasosa, normalmente em psia ou kPa; o limiar de serviço ácido na MR0175/ISO 15156 é expresso por meio da pH2S.' }
      }
    },
    {
      id: 'partial-pressure',
      category: 'corrosion',
      standard: 'MR0175/ISO 15156',
      i18n: {
        en: { term: 'Partial pressure', definition: 'Pressure exerted by a single gas component in a mixture, equal to its mole fraction times total pressure; used for CO2 and H2S corrosion severity.' },
        es: { term: 'Presión parcial', definition: 'Presión ejercida por un único componente gaseoso en una mezcla, igual a su fracción molar multiplicada por la presión total; se usa para la severidad de corrosión por CO2 y H2S.' },
        fr: { term: 'Pression partielle', definition: "Pression exercée par un seul constituant gazeux d'un mélange, égale à sa fraction molaire multipliée par la pression totale; utilisée pour la sévérité de la corrosion par CO2 et H2S." },
        zh: { term: '分压', definition: '混合气体中单一组分施加的压力，等于其摩尔分数乘以总压；用于 CO2 和 H2S 腐蚀严重程度评估。' },
        ru: { term: 'Парциальное давление', definition: 'Давление, создаваемое отдельным газовым компонентом смеси, равное произведению его мольной доли на общее давление; используется для оценки коррозии CO2 и H2S.' },
        ar: { term: 'الضغط الجزئي', definition: 'الضغط الذي يبذله مكوّن غازي واحد في خليط، ويساوي كسر المول مضروباً في الضغط الكلي؛ ويُستخدم لتقييم شدة تآكل CO2 وH2S.' },
        pt: { term: 'Pressão parcial', definition: 'Pressão exercida por um único componente gasoso em uma mistura, igual à sua fração molar vezes a pressão total; usada para a severidade da corrosão por CO2 e H2S.' }
      }
    },
    {
      id: 'de-waard-milliams',
      category: 'corrosion',
      standard: 'NACE/AMPP SP0775',
      i18n: {
        en: { term: 'De Waard–Milliams model', definition: 'A semi-empirical model predicting sweet corrosion rate from CO2 partial pressure, temperature and other factors; widely used as a baseline in corrosion monitoring.' },
        es: { term: 'Modelo De Waard–Milliams', definition: 'Modelo semiempírico que predice la velocidad de corrosión dulce a partir de la presión parcial de CO2, la temperatura y otros factores; muy usado como referencia en el monitoreo de corrosión.' },
        fr: { term: 'Modèle De Waard–Milliams', definition: "Modèle semi-empirique prédisant la vitesse de corrosion douce à partir de la pression partielle de CO2, de la température et d'autres facteurs; largement utilisé comme référence en surveillance de la corrosion." },
        zh: { term: 'De Waard–Milliams 模型', definition: '根据 CO2 分压、温度等因素预测甜性腐蚀速率的半经验模型；广泛用作腐蚀监测的基准。' },
        ru: { term: 'Модель Де Ваарда–Миллиамса', definition: 'Полуэмпирическая модель, прогнозирующая скорость углекислотной коррозии по парциальному давлению CO2, температуре и другим факторам; широко используется как базис при мониторинге коррозии.' },
        ar: { term: 'نموذج دي وارد–ميليامز', definition: 'نموذج شبه تجريبي يتنبأ بمعدل التآكل الحلو انطلاقاً من الضغط الجزئي لـ CO2 ودرجة الحرارة وعوامل أخرى؛ ويُستخدم على نطاق واسع كخط أساس في مراقبة التآكل.' },
        pt: { term: 'Modelo De Waard–Milliams', definition: 'Modelo semiempírico que prevê a taxa de corrosão doce a partir da pressão parcial de CO2, da temperatura e de outros fatores; amplamente usado como referência no monitoramento de corrosão.' }
      }
    },
    {
      id: 'cathodic-protection',
      category: 'corrosion',
      standard: 'NACE SP0169',
      i18n: {
        en: { term: 'Cathodic protection (CP)', definition: 'Technique to control corrosion of a metal by making it the cathode of an electrochemical cell, via sacrificial anodes or impressed current; criteria are given in NACE SP0169.' },
        es: { term: 'Protección catódica (CP)', definition: 'Técnica para controlar la corrosión de un metal convirtiéndolo en cátodo de una celda electroquímica, mediante ánodos de sacrificio o corriente impresa; los criterios figuran en NACE SP0169.' },
        fr: { term: 'Protection cathodique (CP)', definition: "Technique de maîtrise de la corrosion d'un métal en le rendant cathode d'une cellule électrochimique, par anodes sacrificielles ou courant imposé; les critères sont donnés dans NACE SP0169." },
        zh: { term: '阴极保护（CP）', definition: '通过牺牲阳极或外加电流使金属成为电化学电池的阴极来控制腐蚀的技术；准则见 NACE SP0169。' },
        ru: { term: 'Катодная защита (CP)', definition: 'Метод борьбы с коррозией, при котором металл делают катодом электрохимической ячейки с помощью протекторных анодов или наложенного тока; критерии приведены в NACE SP0169.' },
        ar: { term: 'الحماية الكاثودية (CP)', definition: 'تقنية للتحكم في تآكل المعدن بجعله المهبط في خلية كهروكيميائية، عبر أنودات قربانية أو تيار مفروض؛ وترد معاييرها في NACE SP0169.' },
        pt: { term: 'Proteção catódica (CP)', definition: 'Técnica para controlar a corrosão de um metal tornando-o cátodo de uma célula eletroquímica, por ânodos de sacrifício ou corrente impressa; os critérios constam na NACE SP0169.' }
      }
    },
    {
      id: 'cui',
      category: 'corrosion',
      standard: 'NACE SP0198',
      i18n: {
        en: { term: 'Corrosion under insulation (CUI)', definition: 'Localized external corrosion of insulated or fireproofed equipment and piping, caused by trapped moisture; often hidden until insulation is removed.' },
        es: { term: 'Corrosión bajo aislamiento (CUI)', definition: 'Corrosión externa localizada de equipos y tuberías aislados o ignifugados, causada por humedad atrapada; suele permanecer oculta hasta retirar el aislamiento.' },
        fr: { term: 'Corrosion sous calorifuge (CUI)', definition: "Corrosion externe localisée des équipements et tuyauteries calorifugés ou ignifugés, causée par l'humidité piégée; souvent invisible jusqu'au retrait du calorifuge." },
        zh: { term: '保温层下腐蚀（CUI）', definition: '保温或防火设备与管道因截留水分而发生的局部外腐蚀；通常在拆除保温层前难以发现。' },
        ru: { term: 'Коррозия под изоляцией (CUI)', definition: 'Локализованная наружная коррозия изолированного или огнезащищённого оборудования и трубопроводов, вызванная скопившейся влагой; часто скрыта до снятия изоляции.' },
        ar: { term: 'التآكل تحت العزل (CUI)', definition: 'تآكل خارجي موضعي للمعدات والأنابيب المعزولة أو المكسوّة بمواد مقاومة للحريق، ناتج عن الرطوبة المحتجزة؛ ويظل غالباً خفياً حتى يُزال العزل.' },
        pt: { term: 'Corrosão sob isolamento (CUI)', definition: 'Corrosão externa localizada de equipamentos e tubulações isolados ou com proteção contra fogo, causada por umidade retida; frequentemente oculta até a remoção do isolamento.' }
      }
    },
    {
      id: 'pitting',
      category: 'corrosion',
      standard: 'ASTM G46',
      i18n: {
        en: { term: 'Pitting corrosion', definition: 'Localized corrosion producing small cavities or pits in the metal surface; evaluated by depth and density per ASTM G46.' },
        es: { term: 'Corrosión por picaduras', definition: 'Corrosión localizada que produce pequeñas cavidades o picaduras en la superficie del metal; se evalúa por profundidad y densidad según ASTM G46.' },
        fr: { term: 'Corrosion par piqûres', definition: "Corrosion localisée produisant de petites cavités ou piqûres à la surface du métal; évaluée par profondeur et densité selon ASTM G46." },
        zh: { term: '点蚀', definition: '在金属表面产生小孔洞或蚀坑的局部腐蚀；按 ASTM G46 以深度和密度进行评估。' },
        ru: { term: 'Питтинговая (точечная) коррозия', definition: 'Локальная коррозия, образующая на поверхности металла мелкие полости или питтинги; оценивается по глубине и плотности согласно ASTM G46.' },
        ar: { term: 'التآكل التنقّري', definition: 'تآكل موضعي يُنتج تجاويف صغيرة أو تنقّرات على سطح المعدن؛ ويُقيَّم بالعمق والكثافة وفق ASTM G46.' },
        pt: { term: 'Corrosão por pite', definition: 'Corrosão localizada que produz pequenas cavidades ou pites na superfície do metal; avaliada por profundidade e densidade conforme ASTM G46.' }
      }
    },
    {
      id: 'sp0775-severity',
      category: 'corrosion',
      standard: 'NACE/AMPP SP0775',
      i18n: {
        en: { term: 'SP0775 severity classification', definition: 'Qualitative ranking of carbon-steel corrosion rate into low, moderate, high and severe bands; used to normalize coupon and probe results for reporting.' },
        es: { term: 'Clasificación de severidad SP0775', definition: 'Clasificación cualitativa de la velocidad de corrosión del acero al carbono en bandas baja, moderada, alta y severa; se usa para normalizar resultados de cupones y sondas en los informes.' },
        fr: { term: 'Classification de sévérité SP0775', definition: "Classement qualitatif de la vitesse de corrosion de l'acier carbone en bandes faible, modérée, élevée et sévère; utilisé pour normaliser les résultats des coupons et sondes dans les rapports." },
        zh: { term: 'SP0775 严重程度分级', definition: '将碳钢腐蚀速率按低、中、高、严重四档进行定性分级；用于在报告中统一挂片和探针结果。' },
        ru: { term: 'Классификация серьёзности по SP0775', definition: 'Качественное распределение скорости коррозии углеродистой стали по диапазонам: низкая, умеренная, высокая и серьёзная; используется для приведения результатов купонов и датчиков в отчётах.' },
        ar: { term: 'تصنيف الشدة وفق SP0775', definition: 'ترتيب نوعي لمعدل تآكل الفولاذ الكربوني في نطاقات منخفض ومتوسط وعالٍ وشديد؛ ويُستخدم لتوحيد نتائج الكوبونات والمجسّات في التقارير.' },
        pt: { term: 'Classificação de severidade SP0775', definition: 'Classificação qualitativa da taxa de corrosão do aço carbono em faixas baixa, moderada, alta e severa; usada para normalizar resultados de cupons e sondas nos relatórios.' }
      }
    },
    {
      id: 'set-pressure',
      category: 'psv',
      standard: 'API 520 Pt I',
      i18n: {
        en: { term: 'Set pressure', definition: 'Inlet gauge pressure at which a pressure-relief valve is adjusted to open under service conditions; the basis for overpressure and sizing calculations.' },
        es: { term: 'Presión de tarado', definition: 'Presión manométrica de entrada a la que se ajusta la apertura de una válvula de alivio en condiciones de servicio; base de los cálculos de sobrepresión y dimensionamiento.' },
        fr: { term: 'Pression de tarage', definition: "Pression manométrique d'entrée à laquelle une soupape de sûreté est réglée pour s'ouvrir en service; base des calculs de surpression et de dimensionnement." },
        zh: { term: '整定压力', definition: '安全阀在服役条件下被调定开启的入口表压；是超压和选型计算的基准。' },
        ru: { term: 'Давление настройки (set pressure)', definition: 'Манометрическое давление на входе, при котором предохранительный клапан отрегулирован на открытие в рабочих условиях; основа расчётов превышения давления и выбора размера.' },
        ar: { term: 'ضغط الضبط', definition: 'ضغط الدخول المقياسي الذي تُضبط عنده صمامات تخفيف الضغط لتفتح في ظروف الخدمة؛ وهو أساس حسابات الضغط الزائد وتحديد الحجم.' },
        pt: { term: 'Pressão de ajuste', definition: 'Pressão manométrica de entrada na qual uma válvula de alívio é ajustada para abrir em condições de serviço; base dos cálculos de sobrepressão e dimensionamento.' }
      }
    },
    {
      id: 'backpressure',
      category: 'psv',
      standard: 'API 520 Pt I',
      i18n: {
        en: { term: 'Backpressure', definition: 'Pressure existing at the outlet of a pressure-relief device due to downstream pressure; classified as superimposed or built-up backpressure.' },
        es: { term: 'Contrapresión', definition: 'Presión existente en la salida de un dispositivo de alivio debida a la presión aguas abajo; se clasifica en superpuesta o generada.' },
        fr: { term: 'Contre-pression', definition: "Pression régnant à la sortie d'un dispositif de décharge du fait de la pression aval; classée en contre-pression superposée ou engendrée." },
        zh: { term: '背压', definition: '安全泄放装置出口因下游压力而存在的压力；分为叠加背压和积聚背压。' },
        ru: { term: 'Противодавление', definition: 'Давление на выходе предохранительного устройства, обусловленное давлением ниже по потоку; подразделяется на наложенное и создаваемое противодавление.' },
        ar: { term: 'الضغط الخلفي', definition: 'الضغط الموجود عند مخرج جهاز تخفيف الضغط بسبب الضغط في اتجاه مجرى التدفق؛ ويُصنَّف إلى ضغط خلفي متراكب أو متولِّد.' },
        pt: { term: 'Contrapressão', definition: 'Pressão existente na saída de um dispositivo de alívio devido à pressão a jusante; classifica-se em sobreposta ou gerada.' }
      }
    },
    {
      id: 'overpressure',
      category: 'psv',
      standard: 'API 520 Pt I',
      i18n: {
        en: { term: 'Overpressure', definition: 'Pressure increase over the set pressure of a relief device, expressed as a percentage or in pressure units; limited by code allowable values.' },
        es: { term: 'Sobrepresión', definition: 'Incremento de presión por encima de la presión de tarado de un dispositivo de alivio, expresado en porcentaje o en unidades de presión; limitado por los valores admisibles de los códigos.' },
        fr: { term: 'Surpression', definition: "Accroissement de pression au-dessus de la pression de tarage d'un dispositif de décharge, exprimé en pourcentage ou en unités de pression; limité par les valeurs admissibles des codes." },
        zh: { term: '超压', definition: '超过泄放装置整定压力的压力增量，以百分比或压力单位表示；受规范允许值限制。' },
        ru: { term: 'Превышение давления (overpressure)', definition: 'Прирост давления сверх давления настройки предохранительного устройства, выраженный в процентах или единицах давления; ограничивается допускаемыми по нормам значениями.' },
        ar: { term: 'الضغط الزائد', definition: 'زيادة الضغط فوق ضغط ضبط جهاز التخفيف، معبَّر عنها بنسبة مئوية أو بوحدات ضغط؛ وتخضع للقيم المسموح بها في الأكواد.' },
        pt: { term: 'Sobrepressão', definition: 'Aumento de pressão acima da pressão de ajuste de um dispositivo de alívio, expresso em porcentagem ou em unidades de pressão; limitado pelos valores admissíveis dos códigos.' }
      }
    },
    {
      id: 'accumulated-pressure',
      category: 'psv',
      standard: 'API 520 Pt I',
      i18n: {
        en: { term: 'Accumulated pressure', definition: 'Pressure increase over the maximum allowable working pressure (MAWP) of the protected equipment during relief; equals set pressure plus overpressure.' },
        es: { term: 'Presión acumulada', definition: 'Incremento de presión por encima de la presión máxima de trabajo admisible (MAWP) del equipo protegido durante el alivio; equivale a la presión de tarado más la sobrepresión.' },
        fr: { term: 'Pression accumulée', definition: "Accroissement de pression au-dessus de la pression maximale admissible de service (MAWP) de l'équipement protégé pendant la décharge; égale à la pression de tarage plus la surpression." },
        zh: { term: '积聚压力', definition: '泄放期间受保护设备最大允许工作压力（MAWP）之上的压力增量；等于整定压力加超压。' },
        ru: { term: 'Накапливаемое давление (accumulated pressure)', definition: 'Прирост давления сверх максимально допустимого рабочего давления (MAWP) защищаемого оборудования при срабатывании; равен давлению настройки плюс превышение давления.' },
        ar: { term: 'الضغط المتراكم', definition: 'زيادة الضغط فوق أقصى ضغط عمل مسموح (MAWP) للمعدة المحمية أثناء التخفيف؛ وتساوي ضغط الضبط مضافاً إليه الضغط الزائد.' },
        pt: { term: 'Pressão acumulada', definition: 'Aumento de pressão acima da pressão máxima de trabalho admissível (MAWP) do equipamento protegido durante o alívio; equivale à pressão de ajuste mais a sobrepressão.' }
      }
    },
    {
      id: 'orifice-area',
      category: 'psv',
      standard: 'API 526',
      i18n: {
        en: { term: 'Orifice area', definition: 'Minimum net flow area of a pressure-relief valve nozzle; API 526 assigns standard letter designations (D through T) to discrete orifice sizes.' },
        es: { term: 'Área de orificio', definition: 'Área de flujo neta mínima de la tobera de una válvula de alivio; API 526 asigna designaciones de letra normalizadas (D a T) a tamaños discretos de orificio.' },
        fr: { term: "Aire d'orifice", definition: "Section nette minimale d'écoulement de la buse d'une soupape; l'API 526 attribue des désignations par lettre (D à T) aux tailles d'orifice normalisées." },
        zh: { term: '阀口面积', definition: '安全阀喷嘴的最小净流通面积；API 526 为离散阀口尺寸规定了标准字母代号（D 至 T）。' },
        ru: { term: 'Площадь седла (orifice area)', definition: 'Минимальная полезная площадь проходного сечения сопла предохранительного клапана; API 526 назначает стандартные буквенные обозначения (от D до T) дискретным размерам седла.' },
        ar: { term: 'مساحة الفوهة', definition: 'أدنى مساحة تدفق صافية لفوهة صمام تخفيف الضغط؛ وتخصّص API 526 تسميات حرفية قياسية (من D إلى T) لأحجام الفوهات المنفصلة.' },
        pt: { term: 'Área de orifício', definition: 'Área de fluxo líquida mínima do bocal de uma válvula de alívio; a API 526 atribui designações de letra padronizadas (D a T) aos tamanhos discretos de orifício.' }
      }
    },
    {
      id: 'critical-flow',
      category: 'psv',
      standard: 'API 520 Pt I',
      i18n: {
        en: { term: 'Critical flow', definition: 'Flow condition where the fluid reaches sonic velocity at the relief valve throat; sizing then depends only on upstream pressure, not on downstream pressure.' },
        es: { term: 'Flujo crítico', definition: 'Condición de flujo en la que el fluido alcanza velocidad sónica en la garganta de la válvula de alivio; el dimensionamiento depende entonces solo de la presión aguas arriba.' },
        fr: { term: 'Écoulement critique', definition: "Régime où le fluide atteint la vitesse du son au col de la soupape; le dimensionnement ne dépend alors que de la pression amont, et non de la pression aval." },
        zh: { term: '临界流', definition: '流体在安全阀喉部达到音速的流动工况；此时选型仅取决于上游压力，而与下游压力无关。' },
        ru: { term: 'Критическое течение', definition: 'Режим течения, при котором среда достигает скорости звука в горловине клапана; расчёт тогда зависит только от давления на входе, а не от давления на выходе.' },
        ar: { term: 'الجريان الحرج', definition: 'حالة جريان يبلغ فيها المائع السرعة الصوتية عند حلق الصمام؛ وعندها يتوقف تحديد الحجم على ضغط الدخول فقط لا على ضغط الخروج.' },
        pt: { term: 'Fluxo crítico', definition: 'Condição de fluxo em que o fluido atinge a velocidade sônica na garganta da válvula de alívio; o dimensionamento passa a depender apenas da pressão a montante.' }
      }
    },
    {
      id: 'kd',
      category: 'psv',
      standard: 'API 520 Pt I',
      i18n: {
        en: { term: 'Discharge coefficient (Kd)', definition: 'Ratio of the actual to the theoretical relieving capacity of a relief valve; the manufacturer-certified value used in the sizing equation.' },
        es: { term: 'Coeficiente de descarga (Kd)', definition: 'Relación entre la capacidad de alivio real y la teórica de una válvula de alivio; valor certificado por el fabricante usado en la ecuación de dimensionamiento.' },
        fr: { term: 'Coefficient de décharge (Kd)', definition: "Rapport entre la capacité de décharge réelle et théorique d'une soupape; valeur certifiée par le fabricant utilisée dans l'équation de dimensionnement." },
        zh: { term: '排量系数（Kd）', definition: '安全阀实际排量与理论排量之比；选型公式中使用的制造商认证值。' },
        ru: { term: 'Коэффициент расхода (Kd)', definition: 'Отношение фактической к теоретической пропускной способности клапана; сертифицированное изготовителем значение, используемое в расчётной формуле.' },
        ar: { term: 'معامل التصريف (Kd)', definition: 'نسبة سعة التخفيف الفعلية إلى النظرية لصمام التخفيف؛ وهي القيمة المعتمدة من المصنّع والمستخدمة في معادلة تحديد الحجم.' },
        pt: { term: 'Coeficiente de descarga (Kd)', definition: 'Razão entre a capacidade de alívio real e a teórica de uma válvula de alívio; valor certificado pelo fabricante usado na equação de dimensionamento.' }
      }
    },
    {
      id: 'kb',
      category: 'psv',
      standard: 'API 520 Pt I',
      i18n: {
        en: { term: 'Backpressure correction (Kb)', definition: 'Correction factor accounting for the effect of backpressure on the capacity of a balanced relief valve; typically applied for compressible fluids.' },
        es: { term: 'Corrección por contrapresión (Kb)', definition: 'Factor de corrección que contempla el efecto de la contrapresión sobre la capacidad de una válvula de alivio balanceada; se aplica normalmente a fluidos compresibles.' },
        fr: { term: 'Correction de contre-pression (Kb)', definition: "Facteur de correction tenant compte de l'effet de la contre-pression sur la capacité d'une soupape équilibrée; appliqué en général aux fluides compressibles." },
        zh: { term: '背压修正系数（Kb）', definition: '考虑背压对平衡式安全阀排量影响的修正系数；通常适用于可压缩流体。' },
        ru: { term: 'Поправка на противодавление (Kb)', definition: 'Поправочный коэффициент, учитывающий влияние противодавления на пропускную способность уравновешенного клапана; обычно применяется для сжимаемых сред.' },
        ar: { term: 'معامل تصحيح الضغط الخلفي (Kb)', definition: 'معامل تصحيح يراعي تأثير الضغط الخلفي على سعة صمام التخفيف المتوازن؛ ويُطبَّق عادةً على الموائع القابلة للانضغاط.' },
        pt: { term: 'Correção de contrapressão (Kb)', definition: 'Fator de correção que considera o efeito da contrapressão sobre a capacidade de uma válvula de alívio balanceada; normalmente aplicado a fluidos compressíveis.' }
      }
    },
    {
      id: 'kw',
      category: 'psv',
      standard: 'API 520 Pt I',
      i18n: {
        en: { term: 'Backpressure correction (Kw)', definition: 'Correction factor for the effect of backpressure on a conventional relief valve capacity for incompressible (liquid) service.' },
        es: { term: 'Corrección por contrapresión (Kw)', definition: 'Factor de corrección del efecto de la contrapresión sobre la capacidad de una válvula de alivio convencional en servicio de líquidos (incompresible).' },
        fr: { term: 'Correction de contre-pression (Kw)', definition: "Facteur de correction de l'effet de la contre-pression sur la capacité d'une soupape conventionnelle en service liquide (incompressible)." },
        zh: { term: '背压修正系数（Kw）', definition: '背压对常规安全阀在不可压缩（液体）工况下排量影响的修正系数。' },
        ru: { term: 'Поправка на противодавление (Kw)', definition: 'Поправочный коэффициент влияния противодавления на пропускную способность обычного клапана для несжимаемой (жидкой) среды.' },
        ar: { term: 'معامل تصحيح الضغط الخلفي (Kw)', definition: 'معامل تصحيح لأثر الضغط الخلفي على سعة صمام التخفيف التقليدي في خدمة السوائل (غير القابلة للانضغاط).' },
        pt: { term: 'Correção de contrapressão (Kw)', definition: 'Fator de correção do efeito da contrapressão sobre a capacidade de uma válvula de alívio convencional em serviço de líquido (incompressível).' }
      }
    },
    {
      id: 'kc',
      category: 'psv',
      standard: 'API 520 Pt I',
      i18n: {
        en: { term: 'Rupture disk combination factor (Kc)', definition: 'Correction factor applied when a rupture disk is installed upstream of a pressure-relief valve, accounting for the reduced flow area.' },
        es: { term: 'Factor de combinación con disco de ruptura (Kc)', definition: 'Factor de corrección aplicado cuando se instala un disco de ruptura aguas arriba de una válvula de alivio, que contempla la reducción del área de flujo.' },
        fr: { term: 'Facteur de combinaison disque de rupture (Kc)', definition: "Facteur de correction appliqué lorsqu'un disque de rupture est installé en amont d'une soupape, tenant compte de la réduction de la section d'écoulement." },
        zh: { term: '爆破片组合系数（Kc）', definition: '安全阀上游安装爆破片时采用的修正系数，用于考虑流通面积的减小。' },
        ru: { term: 'Коэффициент комбинации с разрывной мембраной (Kc)', definition: 'Поправочный коэффициент, применяемый при установке разрывной мембраны перед предохранительным клапаном и учитывающий уменьшение площади прохода.' },
        ar: { term: 'معامل الجمع مع قرص التمزق (Kc)', definition: 'معامل تصحيح يُطبَّق عند تركيب قرص تمزق قبل صمام تخفيف الضغط، ويراعي انخفاض مساحة التدفق.' },
        pt: { term: 'Fator de combinação com disco de ruptura (Kc)', definition: 'Fator de correção aplicado quando um disco de ruptura é instalado a montante de uma válvula de alívio, considerando a redução da área de fluxo.' }
      }
    },
    {
      id: 'kv',
      category: 'psv',
      standard: 'API 520 Pt I',
      i18n: {
        en: { term: 'Viscosity correction (Kv)', definition: 'Correction factor for the effect of fluid viscosity on the relieving capacity of a relief valve in liquid service.' },
        es: { term: 'Corrección por viscosidad (Kv)', definition: 'Factor de corrección del efecto de la viscosidad del fluido sobre la capacidad de alivio de una válvula en servicio de líquidos.' },
        fr: { term: 'Correction de viscosité (Kv)', definition: "Facteur de correction de l'effet de la viscosité du fluide sur la capacité de décharge d'une soupape en service liquide." },
        zh: { term: '黏度修正系数（Kv）', definition: '液体工况下流体黏度对安全阀排量影响的修正系数。' },
        ru: { term: 'Поправка на вязкость (Kv)', definition: 'Поправочный коэффициент влияния вязкости среды на пропускную способность клапана в жидкой среде.' },
        ar: { term: 'معامل تصحيح اللزوجة (Kv)', definition: 'معامل تصحيح لأثر لزوجة المائع على سعة التخفيف لصمام التخفيف في خدمة السوائل.' },
        pt: { term: 'Correção de viscosidade (Kv)', definition: 'Fator de correção do efeito da viscosidade do fluido sobre a capacidade de alívio de uma válvula em serviço de líquido.' }
      }
    },
    {
      id: 'psv',
      category: 'psv',
      standard: 'API 526',
      i18n: {
        en: { term: 'Pressure safety valve (PSV)', definition: 'A spring-loaded pressure-relief valve actuated by inlet static pressure and characterized by rapid full opening (pop action), used for compressible fluids.' },
        es: { term: 'Válvula de seguridad por presión (PSV)', definition: 'Válvula de alivio accionada por resorte, activada por la presión estática de entrada y caracterizada por una apertura total rápida (acción pop), usada para fluidos compresibles.' },
        fr: { term: 'Soupape de sûreté (PSV)', definition: "Soupape à ressort actionnée par la pression statique d'entrée, caractérisée par une ouverture totale rapide (action pop), utilisée pour les fluides compressibles." },
        zh: { term: '安全阀（PSV）', definition: '由入口静压驱动、以快速全开（突跳动作）为特征的弹簧式泄压阀，用于可压缩流体。' },
        ru: { term: 'Предохранительный клапан (PSV)', definition: 'Пружинный предохранительный клапан, срабатывающий от статического давления на входе и отличающийся быстрым полным открытием (хлопок), применяется для сжимаемых сред.' },
        ar: { term: 'صمام الأمان (PSV)', definition: 'صمام تخفيف ضغط بنابض يعمل بضغط الدخول الاستاتيكي ويتميز بفتح كامل سريع (فعل فرقعة)، ويُستخدم للموائع القابلة للانضغاط.' },
        pt: { term: 'Válvula de segurança (PSV)', definition: 'Válvula de alívio por mola acionada pela pressão estática de entrada e caracterizada por abertura total rápida (ação pop), usada para fluidos compressíveis.' }
      }
    },
    {
      id: 'prv',
      category: 'psv',
      standard: 'API 520 Pt I',
      i18n: {
        en: { term: 'Pressure relief valve (PRV)', definition: 'A pressure-relief device that opens gradually in proportion to the pressure increase over its set pressure; the generic term for relief devices.' },
        es: { term: 'Válvula de alivio de presión (PRV)', definition: 'Dispositivo de alivio que abre gradualmente en proporción al aumento de presión sobre su tarado; término genérico para los dispositivos de alivio.' },
        fr: { term: 'Soupape de décharge (PRV)', definition: "Dispositif de décharge s'ouvrant progressivement proportionnellement à l'élévation de pression au-dessus de son tarage; terme générique des dispositifs de décharge." },
        zh: { term: '泄压阀（PRV）', definition: '随压力超过整定值而成比例逐渐开启的泄压装置；是泄压装置的通用术语。' },
        ru: { term: 'Предохранительный клапан (PRV)', definition: 'Предохранительное устройство, открывающееся постепенно, пропорционально росту давления сверх настройки; общий термин для предохранительных устройств.' },
        ar: { term: 'صمام تخفيف الضغط (PRV)', definition: 'جهاز تخفيف ضغط يفتح تدريجياً بما يتناسب مع ارتفاع الضغط فوق ضبطه؛ وهو المصطلح العام لأجهزة التخفيف.' },
        pt: { term: 'Válvula de alívio de pressão (PRV)', definition: 'Dispositivo de alívio que abre gradualmente em proporção ao aumento de pressão acima do ajuste; termo genérico para dispositivos de alívio.' }
      }
    },
    {
      id: 'posrv',
      category: 'psv',
      standard: 'API 520 Pt I',
      i18n: {
        en: { term: 'Pilot-operated safety relief valve (POSRV)', definition: 'A relief valve whose main valve is controlled by a self-actuated pilot; allows full lift near set pressure and tight shutoff close to it.' },
        es: { term: 'Válvula de alivio pilotada (POSRV)', definition: 'Válvula de alivio cuya válvula principal es controlada por un piloto autoaccionado; permite plena apertura cerca del tarado y cierre hermético próximo a él.' },
        fr: { term: 'Soupape pilotée (POSRV)', definition: "Soupape dont le clapet principal est commandé par un pilote auto-actionné; permet une levée totale près du tarage et une étanchéité proche de celui-ci." },
        zh: { term: '先导式安全泄压阀（POSRV）', definition: '主阀由自驱动先导阀控制的安全阀；可在接近整定压力时全开，并在接近整定压力时紧密关闭。' },
        ru: { term: 'Клапан с пилотным управлением (POSRV)', definition: 'Предохранительный клапан, главный клапан которого управляется самодействующим пилотом; обеспечивает полный подъём вблизи настройки и плотное закрытие около неё.' },
        ar: { term: 'صمام التخفيف ذو التحكم الدليلي (POSRV)', definition: 'صمام تخفيف يتحكم في صمامه الرئيسي دليل ذاتي التشغيل؛ ويتيح رفعاً كاملاً قرب ضغط الضبط وإغلاقاً محكماً بالقرب منه.' },
        pt: { term: 'Válvula de alívio pilotada (POSRV)', definition: 'Válvula de alívio cuja válvula principal é controlada por um piloto autoacionado; permite abertura total perto do ajuste e fechamento estanque próximo a ele.' }
      }
    },
    {
      id: 'blowdown',
      category: 'psv',
      standard: 'API 520 Pt I',
      i18n: {
        en: { term: 'Blowdown', definition: 'Difference between set pressure and reseating pressure of a relief valve, usually expressed as a percentage of set pressure.' },
        es: { term: 'Blowdown (recalce)', definition: 'Diferencia entre la presión de tarado y la presión de reasiento de una válvula de alivio, expresada normalmente como porcentaje de la presión de tarado.' },
        fr: { term: 'Différentiel de fermeture (blowdown)', definition: "Différence entre la pression de tarage et la pression de refermeture d'une soupape, généralement exprimée en pourcentage de la pression de tarage." },
        zh: { term: '回座差（blowdown）', definition: '安全阀整定压力与回座压力之差，通常以整定压力的百分比表示。' },
        ru: { term: 'Диапазон закрытия (blowdown)', definition: 'Разность между давлением настройки и давлением посадки клапана, обычно выражаемая в процентах от давления настройки.' },
        ar: { term: 'فرق الإغلاق (blowdown)', definition: 'الفرق بين ضغط الضبط وضغط إعادة الإغلاق لصمام التخفيف، ويُعبَّر عنه عادةً بنسبة مئوية من ضغط الضبط.' },
        pt: { term: 'Blowdown (reassentamento)', definition: 'Diferença entre a pressão de ajuste e a pressão de reassentamento de uma válvula de alívio, normalmente expressa em porcentagem da pressão de ajuste.' }
      }
    },
    {
      id: 'ili-ild',
      category: 'pipeline',
      standard: 'API 1163',
      i18n: {
        en: { term: 'In-line inspection (ILI) / ILI data (ILD)', definition: 'Use of instrumented pigs to inspect the pipe wall from inside; the resulting measurements are the in-line inspection data (ILD) used for integrity assessment.' },
        es: { term: 'Inspección en línea (ILI) / datos ILI (ILD)', definition: 'Uso de raspadores instrumentados para inspeccionar la pared del ducto desde el interior; las mediciones resultantes son los datos de inspección en línea (ILD) usados para evaluar integridad.' },
        fr: { term: 'Inspection en ligne (ILI) / données ILI (ILD)', definition: "Utilisation de racleurs instrumentés pour inspecter la paroi du pipeline depuis l'intérieur; les mesures obtenues constituent les données d'inspection en ligne (ILD) utilisées pour l'évaluation de l'intégrité." },
        zh: { term: '在线检测（ILI）/在线检测数据（ILD）', definition: '使用智能清管器从管道内部检测管壁；所得测量数据即为用于完整性评估的在线检测数据（ILD）。' },
        ru: { term: 'Внутритрубная диагностика (ILI) / данные ILI (ILD)', definition: 'Применение внутритрубных снарядов-дефектоскопов для контроля стенки трубы изнутри; получаемые измерения образуют данные внутритрубной диагностики (ILD) для оценки целостности.' },
        ar: { term: 'الفحص داخل الخط (ILI) / بيانات الفحص داخل الخط (ILD)', definition: 'استخدام أدوات خنزيرية مزوّدة بأجهزة لفحص جدار الأنبوب من الداخل؛ وتشكّل القياسات الناتجة بيانات الفحص داخل الخط (ILD) المستخدمة في تقييم السلامة.' },
        pt: { term: 'Inspeção em linha (ILI) / dados de ILI (ILD)', definition: 'Uso de pigs instrumentados para inspecionar a parede do duto por dentro; as medições resultantes são os dados de inspeção em linha (ILD) usados na avaliação de integridade.' }
      }
    },
    {
      id: 'row',
      category: 'pipeline',
      standard: 'ASME B31.4/B31.8',
      i18n: {
        en: { term: 'Right-of-way (ROW)', definition: 'A corridor of land over which a pipeline passes, granting the operator legal access for construction, inspection and maintenance.' },
        es: { term: 'Derecho de vía (ROW)', definition: 'Corredor de terreno por el que discurre un ducto, que otorga al operador acceso legal para construcción, inspección y mantenimiento.' },
        fr: { term: 'Emprise (right-of-way, ROW)', definition: "Couloir de terrain traversé par un pipeline, conférant à l'exploitant un accès légal pour la construction, l'inspection et la maintenance." },
        zh: { term: '管道通行权（ROW）', definition: '管道经过的土地走廊，赋予运营方进行建设、检查和维护的合法准入权。' },
        ru: { term: 'Полоса отвода (ROW)', definition: 'Коридор земли, по которому проходит трубопровод, дающий оператору законный доступ для строительства, осмотра и обслуживания.' },
        ar: { term: 'حق المرور (ROW)', definition: 'ممر أرضي يمر عبره خط الأنابيب، يمنح المشغّل حق الوصول القانوني لأعمال الإنشاء والفحص والصيانة.' },
        pt: { term: 'Faixa de servidão (ROW)', definition: 'Corredor de terreno por onde passa um duto, conferindo ao operador acesso legal para construção, inspeção e manutenção.' }
      }
    },
    {
      id: 'station',
      category: 'pipeline',
      standard: 'ASME B31.4',
      i18n: {
        en: { term: 'Station (chainage)', definition: 'Linear reference position along a pipeline, expressed in kilometers (or miles), used to locate features, defects and inspections.' },
        es: { term: 'Estación (progresiva)', definition: 'Posición de referencia lineal a lo largo de un ducto, expresada en kilómetros (o millas), usada para ubicar elementos, defectos e inspecciones.' },
        fr: { term: 'Point kilométrique (station)', definition: "Position de référence linéaire le long d'un pipeline, exprimée en kilomètres (ou miles), utilisée pour localiser les éléments, défauts et inspections." },
        zh: { term: '里程桩（station）', definition: '沿管道的线性参考位置，以公里（或英里）表示，用于定位设施、缺陷和检查点。' },
        ru: { term: 'Пикетаж (station)', definition: 'Линейная координата вдоль трубопровода, выраженная в километрах (или милях), используемая для привязки объектов, дефектов и обследований.' },
        ar: { term: 'المحطة (التسلسل الكيلومتري)', definition: 'موضع مرجعي خطي على طول خط الأنابيب، معبَّر عنه بالكيلومترات (أو الأميال)، يُستخدم لتحديد مواقع المنشآت والعيوب والفحوصات.' },
        pt: { term: 'Estação (quilometragem)', definition: 'Posição de referência linear ao longo de um duto, expressa em quilômetros (ou milhas), usada para localizar elementos, defeitos e inspeções.' }
      }
    },
    {
      id: 'ut-thickness',
      category: 'pipeline',
      standard: 'API 570',
      i18n: {
        en: { term: 'UT wall thickness', definition: 'Wall thickness measured by ultrasonic testing (UT), used to quantify remaining metal and to compute corrosion rates at a location.' },
        es: { term: 'Espesor por ultrasonido (UT)', definition: 'Espesor de pared medido mediante ensayo ultrasónico (UT), usado para cuantificar el metal remanente y calcular velocidades de corrosión en un punto.' },
        fr: { term: 'Épaisseur par ultrasons (UT)', definition: "Épaisseur de paroi mesurée par contrôle ultrasonore (UT), utilisée pour quantifier le métal restant et calculer les vitesses de corrosion en un point." },
        zh: { term: '超声波壁厚（UT）', definition: '通过超声波检测（UT）测得的壁厚，用于量化剩余金属量并计算某位置的腐蚀速率。' },
        ru: { term: 'Толщина стенки по УЗК (UT)', definition: 'Толщина стенки, измеренная ультразвуковым контролем (УЗК), используемая для оценки остаточного металла и расчёта скорости коррозии в точке.' },
        ar: { term: 'سماكة الجدار بالموجات فوق الصوتية (UT)', definition: 'سماكة الجدار المقاسة بالفحص بالموجات فوق الصوتية (UT)، وتُستخدم لتقدير المعدن المتبقي وحساب معدلات التآكل عند موقع ما.' },
        pt: { term: 'Espessura por ultrassom (UT)', definition: 'Espessura de parede medida por ensaio ultrassônico (UT), usada para quantificar o metal remanescente e calcular taxas de corrosão em um ponto.' }
      }
    },
    {
      id: 'coating',
      category: 'pipeline',
      standard: 'NACE SP0169',
      i18n: {
        en: { term: 'Coating', definition: 'A dielectric barrier applied to a buried or submerged structure to separate the metal from the environment; works together with cathodic protection.' },
        es: { term: 'Recubrimiento', definition: 'Barrera dieléctrica aplicada a una estructura enterrada o sumergida para separar el metal del entorno; actúa junto con la protección catódica.' },
        fr: { term: 'Revêtement', definition: "Barrière diélectrique appliquée à une structure enterrée ou immergée pour séparer le métal de l'environnement; agit de concert avec la protection cathodique." },
        zh: { term: '防腐涂层', definition: '施加于埋地或水下结构上、将金属与环境隔开的介电屏障；与阴极保护协同作用。' },
        ru: { term: 'Покрытие', definition: 'Диэлектрический барьер, наносимый на подземное или подводное сооружение для отделения металла от среды; действует совместно с катодной защитой.' },
        ar: { term: 'الطلاء', definition: 'حاجز عازل يُطبَّق على منشأ مدفون أو مغمور لعزل المعدن عن البيئة؛ ويعمل بالاشتراك مع الحماية الكاثودية.' },
        pt: { term: 'Revestimento', definition: 'Barreira dielétrica aplicada a uma estrutura enterrada ou submersa para separar o metal do ambiente; atua em conjunto com a proteção catódica.' }
      }
    },
    {
      id: 'mtbf',
      category: 'apm',
      standard: 'ISO 14224',
      i18n: {
        en: { term: 'Mean time between failures (MTBF)', definition: 'Average operating time between consecutive failures of a repairable item; a core reliability metric defined by ISO 14224.' },
        es: { term: 'Tiempo medio entre fallos (MTBF)', definition: 'Tiempo de operación promedio entre fallos consecutivos de un elemento reparable; métrica central de fiabilidad definida por ISO 14224.' },
        fr: { term: 'Temps moyen entre défaillances (MTBF)', definition: "Durée moyenne de fonctionnement entre défaillances consécutives d'un élément réparable; métrique centrale de fiabilité définie par ISO 14224." },
        zh: { term: '平均故障间隔时间（MTBF）', definition: '可修复部件相邻两次故障之间的平均运行时间；ISO 14224 定义的核心可靠性指标。' },
        ru: { term: 'Средняя наработка на отказ (MTBF)', definition: 'Среднее время работы ремонтопригодного элемента между последовательными отказами; ключевая метрика надёжности по ISO 14224.' },
        ar: { term: 'متوسط الزمن بين الأعطال (MTBF)', definition: 'متوسط زمن التشغيل بين عطلين متتاليين لعنصر قابل للإصلاح؛ وهو مقياس موثوقية أساسي معرَّف في ISO 14224.' },
        pt: { term: 'Tempo médio entre falhas (MTBF)', definition: 'Tempo médio de operação entre falhas consecutivas de um item reparável; métrica central de confiabilidade definida pela ISO 14224.' }
      }
    },
    {
      id: 'mttr',
      category: 'apm',
      standard: 'ISO 14224',
      i18n: {
        en: { term: 'Mean time to repair (MTTR)', definition: 'Average time required to restore a failed item to service, including diagnosis and corrective action; a maintainability metric per ISO 14224.' },
        es: { term: 'Tiempo medio de reparación (MTTR)', definition: 'Tiempo promedio necesario para devolver al servicio un elemento averiado, incluido el diagnóstico y la acción correctiva; métrica de mantenibilidad según ISO 14224.' },
        fr: { term: 'Temps moyen de réparation (MTTR)', definition: "Durée moyenne nécessaire pour remettre en service un élément défaillant, y compris le diagnostic et l'action corrective; métrique de maintenabilité selon ISO 14224." },
        zh: { term: '平均修复时间（MTTR）', definition: '使故障部件恢复服役所需的平均时间，包括诊断和纠正措施；ISO 14224 的维修性指标。' },
        ru: { term: 'Среднее время восстановления (MTTR)', definition: 'Среднее время, необходимое для возврата отказавшего элемента в работу, включая диагностику и корректирующее действие; метрика ремонтопригодности по ISO 14224.' },
        ar: { term: 'متوسط زمن الإصلاح (MTTR)', definition: 'متوسط الزمن اللازم لإعادة العنصر المعطوب إلى الخدمة، بما في ذلك التشخيص والإجراء التصحيحي؛ وهو مقياس قابلية الصيانة وفق ISO 14224.' },
        pt: { term: 'Tempo médio de reparo (MTTR)', definition: 'Tempo médio necessário para recolocar um item com falha em serviço, incluindo diagnóstico e ação corretiva; métrica de mantenabilidade conforme ISO 14224.' }
      }
    },
    {
      id: 'availability',
      category: 'apm',
      standard: 'ISO 14224',
      i18n: {
        en: { term: 'Availability', definition: 'Fraction of time an asset is able to perform its required function, often computed as uptime divided by total time.' },
        es: { term: 'Disponibilidad', definition: 'Fracción del tiempo en que un activo puede desempeñar su función requerida, calculada a menudo como tiempo operativo dividido por el tiempo total.' },
        fr: { term: 'Disponibilité', definition: "Fraction du temps pendant laquelle un actif est capable d'assurer sa fonction requise, souvent calculée comme le temps de fonctionnement divisé par le temps total." },
        zh: { term: '可用度', definition: '资产能够履行其规定功能的时间比例，通常按正常运行时间除以总时间计算。' },
        ru: { term: 'Готовность (availability)', definition: 'Доля времени, в течение которого актив способен выполнять требуемую функцию; часто вычисляется как время работы, делённое на общее время.' },
        ar: { term: 'التوافرية', definition: 'الحصة الزمنية التي يكون فيها الأصل قادراً على أداء وظيفته المطلوبة، وتُحسب غالباً بقسمة زمن التشغيل على الزمن الكلي.' },
        pt: { term: 'Disponibilidade', definition: 'Fração do tempo em que um ativo é capaz de executar sua função requerida, frequentemente calculada como tempo ativo dividido pelo tempo total.' }
      }
    },
    {
      id: 'oee',
      category: 'apm',
      standard: 'ISO 55000',
      i18n: {
        en: { term: 'Overall equipment effectiveness (OEE)', definition: 'Composite indicator multiplying availability, performance and quality to express how effectively an asset is utilized.' },
        es: { term: 'Efectividad global del equipo (OEE)', definition: 'Indicador compuesto que multiplica disponibilidad, rendimiento y calidad para expresar cuán eficazmente se utiliza un activo.' },
        fr: { term: 'Taux de rendement synthétique (OEE)', definition: "Indicateur composite multipliant disponibilité, performance et qualité pour exprimer l'efficacité d'utilisation d'un actif." },
        zh: { term: '设备综合效率（OEE）', definition: '将可用度、性能和质量的乘积作为综合指标，用于表达资产被有效利用的程度。' },
        ru: { term: 'Общая эффективность оборудования (OEE)', definition: 'Комплексный показатель, равный произведению готовности, производительности и качества, выражающий эффективность использования актива.' },
        ar: { term: 'الفعالية الكلية للمعدات (OEE)', definition: 'مؤشر مركّب يضرب التوافرية والأداء والجودة للتعبير عن مدى فعالية استغلال الأصل.' },
        pt: { term: 'Eficácia global do equipamento (OEE)', definition: 'Indicador composto que multiplica disponibilidade, desempenho e qualidade para expressar a eficácia de utilização de um ativo.' }
      }
    },
    {
      id: 'rbi',
      category: 'apm',
      standard: 'API 580',
      i18n: {
        en: { term: 'Risk-based inspection (RBI)', definition: 'A methodology for planning inspection based on risk (probability times consequence of failure), as defined by API 580.' },
        es: { term: 'Inspección basada en riesgo (RBI)', definition: 'Metodología de planificación de la inspección basada en el riesgo (probabilidad por consecuencia del fallo), según la define API 580.' },
        fr: { term: 'Inspection fondée sur le risque (RBI)', definition: "Méthodologie de planification de l'inspection fondée sur le risque (probabilité multipliée par conséquence de défaillance), définie par l'API 580." },
        zh: { term: '基于风险的检验（RBI）', definition: '以风险（失效概率乘以后果）为基础规划检验的方法论，由 API 580 定义。' },
        ru: { term: 'Инспекция на основе риска (RBI)', definition: 'Методология планирования контроля на основе риска (вероятность, умноженная на последствия отказа), определённая в API 580.' },
        ar: { term: 'الفحص القائم على المخاطر (RBI)', definition: 'منهجية لتخطيط الفحص تستند إلى المخاطر (الاحتمال مضروباً في عواقب الفشل)، كما تعرّفها API 580.' },
        pt: { term: 'Inspeção baseada em risco (RBI)', definition: 'Metodologia de planejamento de inspeção baseada no risco (probabilidade vezes consequência da falha), conforme definido pela API 580.' }
      }
    },
    {
      id: 'pof',
      category: 'apm',
      standard: 'API 581',
      i18n: {
        en: { term: 'Probability of failure (POF)', definition: 'Likelihood that an asset will fail within a given period, ranked on a discrete scale (often 1 to 5) in the API 581 RBI methodology.' },
        es: { term: 'Probabilidad de fallo (POF)', definition: 'Verosimilitud de que un activo falle en un periodo dado, clasificada en una escala discreta (a menudo 1 a 5) en la metodología RBI de API 581.' },
        fr: { term: 'Probabilité de défaillance (POF)', definition: "Probabilité qu'un actif défaille sur une période donnée, classée sur une échelle discrète (souvent 1 à 5) dans la méthodologie RBI de l'API 581." },
        zh: { term: '失效概率（POF）', definition: '资产在给定时期内失效的可能性，在 API 581 RBI 方法论中按离散等级（通常 1 至 5）分级。' },
        ru: { term: 'Вероятность отказа (POF)', definition: 'Вероятность того, что актив откажет в заданный период, ранжируемая по дискретной шкале (обычно от 1 до 5) в методологии RBI по API 581.' },
        ar: { term: 'احتمال الفشل (POF)', definition: 'احتمالية تعرّض الأصل للفشل خلال فترة معينة، وتُرتَّب على مقياس منفصل (غالباً من 1 إلى 5) في منهجية RBI وفق API 581.' },
        pt: { term: 'Probabilidade de falha (POF)', definition: 'Probabilidade de um ativo falhar em um dado período, classificada em escala discreta (frequentemente 1 a 5) na metodologia RBI da API 581.' }
      }
    },
    {
      id: 'cof',
      category: 'apm',
      standard: 'API 581',
      i18n: {
        en: { term: 'Consequence of failure (COF)', definition: 'Magnitude of the impact (safety, environmental, financial) if a failure occurs, ranked on a discrete scale in API 581.' },
        es: { term: 'Consecuencia del fallo (COF)', definition: 'Magnitud del impacto (seguridad, ambiental, financiero) si se produce un fallo, clasificada en una escala discreta en API 581.' },
        fr: { term: 'Conséquence de défaillance (COF)', definition: "Ampleur de l'impact (sécurité, environnemental, financier) en cas de défaillance, classée sur une échelle discrète dans l'API 581." },
        zh: { term: '失效后果（COF）', definition: '若发生失效所产生影响（安全、环境、经济）的大小，在 API 581 中按离散等级分级。' },
        ru: { term: 'Последствия отказа (COF)', definition: 'Величина воздействия (безопасность, экология, финансы) при возникновении отказа, ранжируемая по дискретной шкале в API 581.' },
        ar: { term: 'عواقب الفشل (COF)', definition: 'حجم الأثر (السلامة والبيئة والمالية) في حال حدوث الفشل، ويُرتَّب على مقياس منفصل في API 581.' },
        pt: { term: 'Consequência da falha (COF)', definition: 'Magnitude do impacto (segurança, ambiental, financeiro) caso ocorra uma falha, classificada em escala discreta na API 581.' }
      }
    },
    {
      id: 'rbi-band',
      category: 'apm',
      standard: 'API 580/581',
      i18n: {
        en: { term: 'RBI risk band', definition: 'A risk category derived from the combination of POF and COF on a risk matrix, used to prioritize inspection effort.' },
        es: { term: 'Banda de riesgo RBI', definition: 'Categoría de riesgo derivada de la combinación de POF y COF sobre una matriz de riesgo, usada para priorizar el esfuerzo de inspección.' },
        fr: { term: 'Bande de risque RBI', definition: "Catégorie de risque issue de la combinaison POF et COF sur une matrice de risque, utilisée pour prioriser l'effort d'inspection." },
        zh: { term: 'RBI 风险等级', definition: '由风险矩阵上 POF 与 COF 组合得出的风险类别，用于确定检验的优先顺序。' },
        ru: { term: 'Диапазон риска RBI', definition: 'Категория риска, получаемая сочетанием POF и COF на матрице риска и используемая для приоритизации объёма контроля.' },
        ar: { term: 'نطاق مخاطر RBI', definition: 'فئة مخاطر مستمدة من الجمع بين POF وCOF على مصفوفة المخاطر، وتُستخدم لتحديد أولوية جهود الفحص.' },
        pt: { term: 'Faixa de risco RBI', definition: 'Categoria de risco derivada da combinação de POF e COF em uma matriz de risco, usada para priorizar o esforço de inspeção.' }
      }
    },
    {
      id: 'risk-matrix',
      category: 'apm',
      standard: 'API 581',
      i18n: {
        en: { term: 'Risk matrix (API 581)', definition: 'A grid that combines probability and consequence ranks into risk bands; the core output of the API 581 RBI methodology.' },
        es: { term: 'Matriz de riesgo (API 581)', definition: 'Cuadrícula que combina rangos de probabilidad y consecuencia en bandas de riesgo; salida central de la metodología RBI de API 581.' },
        fr: { term: 'Matrice de risque (API 581)', definition: "Grille combinant les rangs de probabilité et de conséquence en bandes de risque; résultat central de la méthodologie RBI de l'API 581." },
        zh: { term: '风险矩阵（API 581）', definition: '将概率与后果等级组合成风险带的网格；是 API 581 RBI 方法论的核心输出。' },
        ru: { term: 'Матрица рисков (API 581)', definition: 'Сетка, объединяющая ранги вероятности и последствий в диапазоны риска; ключевой результат методологии RBI по API 581.' },
        ar: { term: 'مصفوفة المخاطر (API 581)', definition: 'شبكة تجمع رتب الاحتمال والعواقب في نطاقات مخاطر؛ وهي الناتج الأساسي لمنهجية RBI وفق API 581.' },
        pt: { term: 'Matriz de risco (API 581)', definition: 'Grade que combina níveis de probabilidade e consequência em faixas de risco; saída central da metodologia RBI da API 581.' }
      }
    },
    {
      id: 'asset',
      category: 'apm',
      standard: 'ISO 55000',
      i18n: {
        en: { term: 'Asset (ISO 55000)', definition: 'An item, thing or entity that has potential or actual value to an organization; the fundamental object managed by an asset management system per ISO 55000.' },
        es: { term: 'Activo (ISO 55000)', definition: 'Elemento, cosa o entidad que tiene valor potencial o real para una organización; objeto fundamental gestionado por un sistema de gestión de activos según ISO 55000.' },
        fr: { term: 'Actif (ISO 55000)', definition: "Élément, chose ou entité ayant une valeur potentielle ou réelle pour une organisation; objet fondamental géré par un système de gestion d'actifs selon ISO 55000." },
        zh: { term: '资产（ISO 55000）', definition: '对组织具有潜在或实际价值的物品、事物或实体；是 ISO 55000 资产管理体系管理的基本对象。' },
        ru: { term: 'Актив (ISO 55000)', definition: 'Предмет, вещь или сущность, имеющая потенциальную или фактическую ценность для организации; базовый объект системы управления активами по ISO 55000.' },
        ar: { term: 'الأصل (ISO 55000)', definition: 'عنصر أو شيء أو كيان له قيمة محتملة أو فعلية للمنظمة؛ وهو الكائن الأساسي الذي يديره نظام إدارة الأصول وفق ISO 55000.' },
        pt: { term: 'Ativo (ISO 55000)', definition: 'Item, coisa ou entidade que tem valor potencial ou real para uma organização; objeto fundamental gerido por um sistema de gestão de ativos conforme ISO 55000.' }
      }
    },
    {
      id: 'work-order',
      category: 'apm',
      standard: 'ISO 14224',
      i18n: {
        en: { term: 'Work order', definition: 'A formal instruction authorizing maintenance or inspection work on an asset, linking the activity to failure and reliability records per ISO 14224.' },
        es: { term: 'Orden de trabajo', definition: 'Instrucción formal que autoriza trabajos de mantenimiento o inspección sobre un activo, vinculando la actividad a los registros de fallos y fiabilidad según ISO 14224.' },
        fr: { term: 'Ordre de travail', definition: "Instruction formelle autorisant des travaux de maintenance ou d'inspection sur un actif, reliant l'activité aux enregistrements de défaillance et de fiabilité selon ISO 14224." },
        zh: { term: '工单', definition: '授权对资产开展维护或检验工作的正式指令，将活动与故障和可靠性记录关联起来（ISO 14224）。' },
        ru: { term: 'Наряд-заказ (work order)', definition: 'Формальное распоряжение, разрешающее работы по обслуживанию или контролю актива и связывающее их с записями об отказах и надёжности по ISO 14224.' },
        ar: { term: 'أمر العمل', definition: 'تعليمات رسمية تأذن بأعمال صيانة أو فحص على أحد الأصول، وتربط النشاط بسجلات الأعطال والموثوقية وفق ISO 14224.' },
        pt: { term: 'Ordem de serviço', definition: 'Instrução formal que autoriza trabalhos de manutenção ou inspeção em um ativo, vinculando a atividade aos registros de falha e confiabilidade conforme ISO 14224.' }
      }
    },
    {
      id: 'std-sp0775',
      category: 'standards',
      standard: 'NACE/AMPP SP0775',
      i18n: {
        en: { term: 'NACE/AMPP SP0775', definition: 'Standard practice for the preparation, installation, analysis and interpretation of corrosion coupons and other monitoring techniques in oilfield operations.' },
        es: { term: 'NACE/AMPP SP0775', definition: 'Práctica estándar para la preparación, instalación, análisis e interpretación de cupones de corrosión y otras técnicas de monitoreo en operaciones petroleras.' },
        fr: { term: 'NACE/AMPP SP0775', definition: "Pratique recommandée pour la préparation, l'installation, l'analyse et l'interprétation des coupons de corrosion et autres techniques de surveillance en exploitation pétrolière." },
        zh: { term: 'NACE/AMPP SP0775', definition: '油田作业中腐蚀挂片及其他监测技术的制备、安装、分析和解释的标准做法。' },
        ru: { term: 'NACE/AMPP SP0775', definition: 'Стандартная практика подготовки, установки, анализа и интерпретации коррозионных купонов и других методов мониторинга в нефтепромысловых операциях.' },
        ar: { term: 'NACE/AMPP SP0775', definition: 'ممارسة قياسية لتحضير وتركيب وتحليل وتفسير كوبونات التآكل وتقنيات المراقبة الأخرى في عمليات حقول النفط.' },
        pt: { term: 'NACE/AMPP SP0775', definition: 'Prática padrão para preparação, instalação, análise e interpretação de cupons de corrosão e outras técnicas de monitoramento em operações de campos de petróleo.' }
      }
    },
    {
      id: 'std-iso-14224',
      category: 'standards',
      standard: 'ISO 14224',
      i18n: {
        en: { term: 'ISO 14224', definition: 'International standard for the collection and exchange of reliability and maintenance data for equipment in the petroleum, petrochemical and natural gas industries.' },
        es: { term: 'ISO 14224', definition: 'Norma internacional para la recopilación e intercambio de datos de fiabilidad y mantenimiento de equipos en las industrias del petróleo, petroquímica y gas natural.' },
        fr: { term: 'ISO 14224', definition: "Norme internationale pour la collecte et l'échange de données de fiabilité et de maintenance des équipements dans les industries pétrolière, pétrochimique et gazière." },
        zh: { term: 'ISO 14224', definition: '石油、石化和天然气行业设备可靠性与维修数据收集与交换的国际标准。' },
        ru: { term: 'ISO 14224', definition: 'Международный стандарт сбора и обмена данными о надёжности и техническом обслуживании оборудования в нефтяной, нефтехимической и газовой отраслях.' },
        ar: { term: 'ISO 14224', definition: 'معيار دولي لجمع وتبادل بيانات الموثوقية والصيانة للمعدات في صناعات النفط والبتروكيماويات والغاز الطبيعي.' },
        pt: { term: 'ISO 14224', definition: 'Norma internacional para coleta e intercâmbio de dados de confiabilidade e manutenção de equipamentos nas indústrias de petróleo, petroquímica e gás natural.' }
      }
    },
    {
      id: 'std-api-581',
      category: 'standards',
      standard: 'API 581',
      i18n: {
        en: { term: 'API 581', definition: 'Risk-Based Inspection Methodology: a quantitative companion to API 580 that details how to compute probability and consequence of failure.' },
        es: { term: 'API 581', definition: 'Metodología de inspección basada en riesgo: complemento cuantitativo de API 580 que detalla cómo calcular la probabilidad y la consecuencia del fallo.' },
        fr: { term: 'API 581', definition: "Méthodologie d'inspection fondée sur le risque : complément quantitatif de l'API 580 détaillant le calcul de la probabilité et de la conséquence de défaillance." },
        zh: { term: 'API 581', definition: '基于风险的检验方法论：API 580 的定量配套文件，详细说明如何计算失效概率与后果。' },
        ru: { term: 'API 581', definition: 'Методология инспекции на основе риска: количественное дополнение к API 580, детализирующее расчёт вероятности и последствий отказа.' },
        ar: { term: 'API 581', definition: 'منهجية الفحص القائم على المخاطر: ملحق كمّي للمواصفة API 580 يوضّح بالتفصيل كيفية حساب احتمال الفشل وعواقبه.' },
        pt: { term: 'API 581', definition: 'Metodologia de inspeção baseada em risco: complemento quantitativo da API 580 que detalha como calcular a probabilidade e a consequência da falha.' }
      }
    },
    {
      id: 'ogmp-2-0',
      category: 'data',
      standard: 'OGMP 2.0',
      i18n: {
        en: { term: 'OGMP 2.0', definition: 'Oil & Gas Methane Partnership 2.0 reporting framework for company-level and source-level methane emissions, enabling measurement-based reconciliation.' },
        es: { term: 'OGMP 2.0', definition: 'Marco de reporte de la Alianza del Metano de Petróleo y Gas 2.0 para emisiones de metano a nivel de compañía y de fuente, que permite la conciliación basada en mediciones.' },
        fr: { term: 'OGMP 2.0', definition: "Cadre de déclaration du Partenariat pour le méthane pétrolier et gazier 2.0 relatif aux émissions de méthane au niveau de l'entreprise et des sources, permettant un rapprochement fondé sur les mesures." },
        zh: { term: 'OGMP 2.0', definition: '油气甲烷伙伴关系 2.0 报告框架，覆盖公司级和源级甲烷排放，支持基于测量的核对。' },
        ru: { term: 'OGMP 2.0', definition: 'Структура отчётности Партнёрства по метану в нефтегазовой отрасли 2.0 по выбросам метана на уровне компании и источников, обеспечивающая сверку на основе измерений.' },
        ar: { term: 'OGMP 2.0', definition: 'إطار الإبلاغ 2.0 لشراكة الميثان في النفط والغاز لانبعاثات الميثان على مستوى الشركة والمصدر، مما يتيح المطابقة القائمة على القياس.' },
        pt: { term: 'OGMP 2.0', definition: 'Estrutura de relato da Parceria de Metano de Petróleo e Gás 2.0 para emissões de metano em nível de empresa e de fonte, permitindo reconciliação baseada em medições.' }
      }
    },
    {
      id: 'witsml',
      category: 'data',
      standard: 'Energistics WITSML',
      i18n: {
        en: { term: 'WITSML', definition: 'Wellsite Information Transfer Standard Markup Language: an XML data-exchange standard for drilling, completion and well data transfer between operators and service companies.' },
        es: { term: 'WITSML', definition: 'Lenguaje de marcado estándar para transferencia de información de pozo: estándar XML de intercambio de datos de perforación, completación y pozo entre operadores y empresas de servicio.' },
        fr: { term: 'WITSML', definition: "Langage de balisage standard de transfert d'informations de chantier : standard XML d'échange de données de forage, de complétion et de puits entre opérateurs et sociétés de service." },
        zh: { term: 'WITSML', definition: '井场信息传输标准标记语言：用于作业者与服务公司之间传输钻井、完井和井数据的 XML 数据交换标准。' },
        ru: { term: 'WITSML', definition: 'Стандартный язык разметки передачи промысловой информации: XML-стандарт обмена данными бурения, заканчивания и скважинными данными между операторами и сервисными компаниями.' },
        ar: { term: 'WITSML', definition: 'لغة الترميز القياسية لنقل معلومات موقع البئر: معيار تبادل بيانات XML لنقل بيانات الحفر والإكمال والآبار بين المشغّلين وشركات الخدمات.' },
        pt: { term: 'WITSML', definition: 'Linguagem de marcação padrão para transferência de informações de poço: padrão XML de intercâmbio de dados de perfuração, completação e poço entre operadoras e empresas de serviço.' }
      }
    },
    {
      id: 'centrifugal-pump',
      category: 'apm',
      standard: 'API 610',
      i18n: {
        en: { term: 'Centrifugal pump (API 610)', definition: 'A rotodynamic pump that raises fluid energy with a rotating impeller; the workhorse of oil & gas transfer, specified per API 610 / ISO 13709.' },
        es: { term: 'Bomba centrífuga (API 610)', definition: 'Bomba rotodinámica que incrementa la energía del fluido mediante un impulsor giratorio; el equipo esencial de bombeo en petróleo y gas, especificado según API 610 / ISO 13709.' },
        fr: { term: 'Pompe centrifuge (API 610)', definition: "Pompe rotodynamique qui élève l'énergie du fluide grâce à une roue en rotation ; l'équipement de pompage de référence du pétrole et du gaz, spécifié selon l'API 610 / ISO 13709." },
        zh: { term: '离心泵（API 610）', definition: '利用旋转叶轮提升流体能量的旋转动力泵；油气输送的主力泵型，按 API 610 / ISO 13709 规定。' },
        ru: { term: 'Центробежный насос (API 610)', definition: 'Динамический насос, повышающий энергию жидкости вращающимся рабочим колесом; основной насос нефтегазовой отрасли, по API 610 / ISO 13709.' },
        ar: { term: 'مضخة طرد مركزي (API 610)', definition: 'مضخة ديناميكية ترفع طاقة المائع بواسطة دافعة دوّارة؛ وهي المضخة الأساسية في نقل النفط والغاز، ومحدَّدة وفق API 610 / ISO 13709.' },
        pt: { term: 'Bomba centrífuga (API 610)', definition: 'Bomba rotodinâmica que eleva a energia do fluido por meio de um rotor; o equipamento de bombeamento padrão em petróleo e gás, especificado conforme API 610 / ISO 13709.' }
      }
    },
    {
      id: 'fire-pump',
      category: 'apm',
      standard: 'NFPA 20',
      i18n: {
        en: { term: 'Fire pump (NFPA 20)', definition: 'A dedicated pump that supplies water to a fire-protection system at the required flow and pressure; installed and tested per NFPA 20.' },
        es: { term: 'Bomba contra incendio (NFPA 20)', definition: 'Bomba dedicada que suministra agua a un sistema de protección contra incendios con el caudal y la presión requeridos; instalada y probada según NFPA 20.' },
        fr: { term: "Pompe à incendie (NFPA 20)", definition: "Pompe dédiée qui alimente un système de protection incendie au débit et à la pression requis ; installée et éprouvée selon la NFPA 20." },
        zh: { term: '消防泵（NFPA 20）', definition: '向消防系统提供所需流量和压力的专用泵；按 NFPA 20 安装和试验。' },
        ru: { term: 'Пожарный насос (NFPA 20)', definition: 'Специализированный насос, подающий воду в систему противопожарной защиты с требуемым расходом и напором; устанавливается и испытывается по NFPA 20.' },
        ar: { term: 'مضخة حريق (NFPA 20)', definition: 'مضخة مخصّصة تزوّد نظام الحماية من الحريق بالماء عند معدل التدفق والضغط المطلوبين؛ وتُركّب وتُختبر وفق NFPA 20.' },
        pt: { term: 'Bomba de incêndio (NFPA 20)', definition: 'Bomba dedicada que alimenta um sistema de proteção contra incêndio com a vazão e a pressão requeridas; instalada e ensaiada conforme NFPA 20.' }
      }
    },
    {
      id: 'foam-deluge',
      category: 'apm',
      standard: 'NFPA 11',
      i18n: {
        en: { term: 'Foam deluge system (NFPA 11)', definition: 'A fixed system that discharges foam solution through open nozzles to blanket a hazard area; design and expansion ratios follow NFPA 11.' },
        es: { term: 'Sistema de espuma (NFPA 11)', definition: 'Sistema fijo que descarga solución de espuma a través de boquillas abiertas para cubrir un área de riesgo; el diseño y las relaciones de expansión siguen NFPA 11.' },
        fr: { term: 'Système à mousse (NFPA 11)', definition: "Système fixe qui décharge une solution moussante par des buses ouvertes pour recouvrir une zone à risque ; conception et taux de foisonnement selon la NFPA 11." },
        zh: { term: '泡沫喷淋系统（NFPA 11）', definition: '通过开式喷头喷洒泡沫混合液以覆盖危险区域的固定式系统；设计与发泡倍数依据 NFPA 11。' },
        ru: { term: 'Система пенного пожаротушения (NFPA 11)', definition: 'Стационарная система, подающая пенный раствор через открытые оросители для покрытия опасной зоны; проектирование и кратность пены — по NFPA 11.' },
        ar: { term: 'نظام الرغوة (NFPA 11)', definition: 'نظام ثابت يصرّف محلول الرغوة عبر فوهات مفتوحة لتغطية منطقة الخطر؛ ويتبع التصميم ونسب التمدد معيار NFPA 11.' },
        pt: { term: 'Sistema de espuma (NFPA 11)', definition: 'Sistema fixo que descarrega solução de espuma por bicos abertos para cobrir uma área de risco; o projeto e as taxas de expansão seguem a NFPA 11.' }
      }
    },
    {
      id: 'emergency-generator',
      category: 'apm',
      standard: 'ISO 8528',
      i18n: {
        en: { term: 'Emergency generator (ISO 8528)', definition: 'An engine-driven generating set that supplies standby power to critical loads on loss of the primary supply; performance classes are defined by ISO 8528.' },
        es: { term: 'Generador eléctrico (ISO 8528)', definition: 'Grupo electrógeno accionado por motor que suministra energía de respaldo a cargas críticas al perderse el suministro principal; las clases de prestación las define ISO 8528.' },
        fr: { term: 'Groupe électrogène (ISO 8528)', definition: "Groupe entraîné par moteur qui fournit une alimentation de secours aux charges critiques en cas de perte de l'alimentation principale ; les classes de performance sont définies par l'ISO 8528." },
        zh: { term: '发电机组（ISO 8528）', definition: '在主电源失电时向关键负载提供备用电源的发动机驱动发电机组；其性能等级由 ISO 8528 规定。' },
        ru: { term: 'Электрогенератор (ISO 8528)', definition: 'Генераторная установка с приводом от двигателя, обеспечивающая резервное питание ответственных нагрузок при потере основного источника; классы характеристик определяет ISO 8528.' },
        ar: { term: 'مولد كهربائي (ISO 8528)', definition: 'مجموعة توليد بمحرك تزوّد الأحمال الحرجة بالطاقة الاحتياطية عند فقدان المصدر الرئيسي؛ وتُحدَّد فئات الأداء في ISO 8528.' },
        pt: { term: 'Gerador elétrico (ISO 8528)', definition: 'Conjunto gerador acionado por motor que fornece energia de reserva a cargas críticas na perda do suprimento principal; as classes de desempenho são definidas pela ISO 8528.' }
      }
    },
    {
      id: 'eemua-191',
      category: 'standards',
      standard: 'EEMUA 191',
      i18n: {
        en: { term: 'EEMUA 191 alarm management', definition: 'A UK guidance on alarm system design, management and procurement that sets targets for alarm rates and operator load to keep control rooms manageable.' },
        es: { term: 'Gestión de alarmas EEMUA 191', definition: 'Guía británica sobre diseño, gestión y adquisición de sistemas de alarmas que fija objetivos de tasa de alarmas y carga del operador para mantener las salas de control gestionables.' },
        fr: { term: 'Gestion des alarmes EEMUA 191', definition: "Guide britannique sur la conception, la gestion et l'acquisition des systèmes d'alarme fixant des objectifs de taux d'alarme et de charge opérateur pour garder les salles de contrôle maîtrisables." },
        zh: { term: 'EEMUA 191 报警管理', definition: '英国关于报警系统设计、管理与采购的指南，设定报警率和操作员负荷目标，使控制室保持可管理状态。' },
        ru: { term: 'Управление аварийными сигналами EEMUA 191', definition: 'Британское руководство по проектированию, управлению и закупке систем сигнализации; задаёт целевые показатели частоты сигналов и нагрузки оператора для управляемости операторных.' },
        ar: { term: 'إدارة الإنذارات EEMUA 191', definition: 'دليل بريطاني لتصميم وإدارة وشراء أنظمة الإنذار، يحدّد أهدافاً لمعدل الإنذارات وعبء المشغّل للحفاظ على قابلية إدارة غرف التحكم.' },
        pt: { term: 'Gestão de alarmes EEMUA 191', definition: 'Guia britânico sobre projeto, gestão e aquisição de sistemas de alarme que estabelece metas de taxa de alarmes e carga do operador para manter as salas de controle gerenciáveis.' }
      }
    },
    {
      id: 'nr-23',
      category: 'standards',
      standard: 'NR-23',
      i18n: {
        en: { term: 'NR-23 fire protection (Brazil)', definition: 'The Brazilian regulatory standard (Ministry of Labour, updated 2022) mandating fire protection measures, egress and fire-fighting equipment in workplaces.' },
        es: { term: 'Protección contra incendios NR-23 (Brasil)', definition: 'Norma reglamentaria brasileña (Ministerio de Trabajo, actualizada en 2022) que exige medidas de protección contra incendios, salidas de emergencia y equipos de combate en los lugares de trabajo.' },
        fr: { term: 'Protection incendie NR-23 (Brésil)', definition: "Norme réglementaire brésilienne (Ministère du Travail, mise à jour en 2022) imposant les mesures de protection incendie, les issues de secours et les équipements de lutte dans les lieux de travail." },
        zh: { term: 'NR-23 消防保护（巴西）', definition: '巴西监管标准（劳动部，2022 年更新），规定工作场所的消防措施、疏散通道和灭火设备。' },
        ru: { term: 'Пожарная защита NR-23 (Бразилия)', definition: 'Бразильский нормативный стандарт (Министерство труда, обновлён в 2022 г.), предписывающий меры противопожарной защиты, пути эвакуации и средства пожаротушения на рабочих местах.' },
        ar: { term: 'الحماية من الحريق NR-23 (البرازيل)', definition: 'معيار تنظيمي برازيلي (وزارة العمل، مُحدَّث في 2022) يفرض تدابير الحماية من الحريق ومخارج الطوارئ ومعدات مكافحة الحرائق في أماكن العمل.' },
        pt: { term: 'Proteção contra incêndio NR-23 (Brasil)', definition: 'Norma regulamentadora brasileira (Ministério do Trabalho, atualizada em 2022) que exige medidas de proteção contra incêndio, saídas de emergência e equipamentos de combate em locais de trabalho.' }
      }
    }
  ];

  function byCategory(cat) {
    return terms.filter(function (t) { return t.category === cat; });
  }

  function normalize(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function search(query, locale) {
    var loc = LOCALES.indexOf(locale) !== -1 ? locale : 'en';
    var q = normalize(query);
    if (!q) { return terms.slice(); }
    return terms.filter(function (t) {
      var entry = (t.i18n && t.i18n[loc]) || (t.i18n && t.i18n.en) || {};
      var hay = normalize((entry.term || '') + ' ' + (entry.definition || ''));
      return hay.indexOf(q) !== -1;
    });
  }

  return { terms: terms, byCategory: byCategory, search: search };
});
