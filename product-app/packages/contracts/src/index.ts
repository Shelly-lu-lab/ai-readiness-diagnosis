export const WORKFORCE_MINIMUM_SAMPLE = 2 as const;
export const STANDARD_GROUP_SAMPLE = 30 as const;
const HISTORICAL_SCORING_POLICY_V01 = {
  rawScale: [1, 2, 3, 4, 5],
  standardizedValues: [0, 25, 50, 75, 100],
  dimensionRequiredItems: 3,
  dimensionTotalItems: 4,
  axisRequiredItems: 12,
  axisTotalItems: 16,
  impactRequiredItems: 7,
  impactTotalItems: 10,
  scoreBands: [45, 55, 70],
  classificationThresholds: { low: 45, middle: 55, high: 70 },
  workforceMinimumSample: 7,
  standardDepartmentSample: 30,
  anonymousResearchCellMinimum: 10,
} as const;

export const VERSION_TUPLE = {
  itemVersion: "v2.0",
  administrationVersion: "v0.1",
  scoringVersion: "v1.1",
  thresholdVersion: "threshold_v0.2",
  itemPatternVersion: "item_pattern_v0.4",
  diagnosisAssemblyVersion: "diagnosis_assembly_v0.2",
  expressionVersion: "fixed_v0.9.3",
  profileNarrativeVersion: "profile_narrative_v0.4",
  diagnosisActionLibraryVersion: "v0.3",
  actionSelectionVersion: "action_selection_v0.3.1",
  developmentPathwayVersion: "development_pathway_v0.6",
  reportStorylineVersion: "report_storyline_v0.2",
  pdfLayoutVersion: "pdf_layout_v0.4",
  reportTemplateVersion: "v0.9.3",
} as const;
export const EXECUTABLE_RULESET_SHA256 =
  "577e3ae37fcb8adcc8a64cdaafe4e20f478ac46b632c6df84a1c46bc67bd0c64" as const;
export const BUILTIN_RULE_RELEASE_ID = "rule-release-v0.9.3" as const;
export const BUILTIN_RULE_ARTIFACT_ID = "rule-artifact-v0.9.3" as const;
export const BUILTIN_RULE_ARTIFACT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAU26X4++dCf32+PY7UtUGPL3Aj830MN9o/A0vCm8P1oM=
-----END PUBLIC KEY-----
` as const;
export const BUILTIN_RULE_ARTIFACT_SIGNATURE =
  "ydgcQtUKk4DnYuII4D63FD5+VcpNutG28sX3m6y4Szo4+Ic7psjJXx2MN+lMU9SlMSR0WgToJa2HYM/yAYDaCA==" as const;

export const HISTORICAL_RULE_ARTIFACT_V092 = {
  schemaVersion: "rule_artifact_v0.9.2",
  releaseId: "rule-release-v0.9.2",
  artifactId: "rule-artifact-v0.9.2",
  manifestHash: "5175a4ef9c34a34274406385616a44284421aa29544714bc7764b609dfe3a799",
  versions: {
    itemVersion: "v2.0", administrationVersion: "v0.1", scoringVersion: "v1.1",
    thresholdVersion: "threshold_v0.1", itemPatternVersion: "item_pattern_v0.3",
    diagnosisAssemblyVersion: "diagnosis_assembly_v0.2", expressionVersion: "fixed_v0.9.2",
    profileNarrativeVersion: "profile_narrative_v0.4", diagnosisActionLibraryVersion: "v0.3",
    actionSelectionVersion: "action_selection_v0.3.1", developmentPathwayVersion: "development_pathway_v0.6",
    reportStorylineVersion: "report_storyline_v0.2", pdfLayoutVersion: "pdf_layout_v0.4",
    reportTemplateVersion: "v0.9.2",
  },
  scoringPolicy: {
    rawScale: [1, 2, 3, 4, 5], standardizedValues: [0, 25, 50, 75, 100],
    dimensionRequiredItems: 3, dimensionTotalItems: 4, axisRequiredItems: 12,
    axisTotalItems: 16, impactRequiredItems: 7, impactTotalItems: 10,
    scoreBands: [45, 55, 70], classificationThresholds: { low: 45, middle: 55, high: 70 },
    workforceMinimumSample: 7, standardDepartmentSample: 30, anonymousResearchCellMinimum: 10,
  },
  components: [
    "questionnaire_v2.0", "scoring_v1.1", "threshold_v0.1", "item_pattern_v0.3",
    "diagnosis_assembly_v0.2", "diagnosis_action_library_v0.3", "action_selection_v0.3.1",
    "profile_narrative_v0.4", "report_storyline_v0.2", "report_template_v0.9.2",
    "pdf_layout_v0.4", "assessment_profile_v0.2", "development_pathway_v0.6",
  ],
  scientificBoundary:
    "This artifact freezes the executable product rules; it does not assert psychometric validation or intervention effectiveness.",
} as const;
export const HISTORICAL_RULE_ARTIFACT_V092_HASH =
  "0809e4ab90145fa8d30db3a1016d600a6ef43e80eed3b64c67301c207eaffee5" as const;
export const HISTORICAL_RULE_ARTIFACT_V092_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAAzL4VMIiuceNLIEQ3F03v6/rCSRmYxtw8zwmP9Oqh7g=
-----END PUBLIC KEY-----
` as const;
export const HISTORICAL_RULE_ARTIFACT_V092_SIGNATURE =
  "cCngBLZ0t0UqjUT5GeXY8mfQ8BQI6jzo4396H5LSyH069zzcWLl2r3JgLhzGlLf9vCiwOjGueITe6wQNMg17AQ==" as const;

export const HISTORICAL_RULE_ARTIFACT_V091 = {
  schemaVersion: "rule_artifact_v0.9.1",
  releaseId: "rule-release-v0.9.1",
  artifactId: "rule-artifact-v0.9.1",
  manifestHash: "b79e3c672f105c7597463783828c25af2b788bb9330116f1b0b0a32e458ffadc",
  versions: {
    itemVersion: "v2.0", administrationVersion: "v0.1", scoringVersion: "v1.1",
    thresholdVersion: "threshold_v0.1", itemPatternVersion: "item_pattern_v0.3",
    diagnosisAssemblyVersion: "diagnosis_assembly_v0.2", expressionVersion: "fixed_v0.9.1",
    profileNarrativeVersion: "profile_narrative_v0.3", diagnosisActionLibraryVersion: "v0.2",
    actionSelectionVersion: "action_selection_v0.3.1", developmentPathwayVersion: "development_pathway_v0.5",
    reportStorylineVersion: "report_storyline_v0.2", pdfLayoutVersion: "pdf_layout_v0.3",
    reportTemplateVersion: "v0.9.1",
  },
  scoringPolicy: {
    rawScale: [1, 2, 3, 4, 5], standardizedValues: [0, 25, 50, 75, 100],
    dimensionRequiredItems: 3, dimensionTotalItems: 4, axisRequiredItems: 12,
    axisTotalItems: 16, impactRequiredItems: 7, impactTotalItems: 10,
    scoreBands: [45, 55, 70], classificationThresholds: { low: 45, middle: 55, high: 70 },
    workforceMinimumSample: 7, standardDepartmentSample: 30, anonymousResearchCellMinimum: 10,
  },
  components: [
    "questionnaire_v2.0", "scoring_v1.1", "threshold_v0.1", "item_pattern_v0.3",
    "diagnosis_assembly_v0.2", "diagnosis_action_library_v0.2", "action_selection_v0.3.1",
    "profile_narrative_v0.3", "report_storyline_v0.2", "report_template_v0.9.1",
    "pdf_layout_v0.3", "assessment_profile_v0.2", "development_pathway_v0.5",
  ],
  scientificBoundary:
    "This artifact freezes the executable product rules; it does not assert psychometric validation or intervention effectiveness.",
} as const;
export const HISTORICAL_RULE_ARTIFACT_V091_HASH =
  "9537e7bad128585267595a3ffefeb43d1959f84fd55b642cd2f9d339d300c270" as const;
export const HISTORICAL_RULE_ARTIFACT_V091_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAm8l6zPgSjIbGvOGRpZrvbCkc5hFSoJiBbkOUgemLc+8=
-----END PUBLIC KEY-----
` as const;
export const HISTORICAL_RULE_ARTIFACT_V091_SIGNATURE =
  "o/Nk1hg8vzA9FcJ4OqZDtakdrMP80ltAMg51zwtSsLHLUCb8g1Ca1HTSVM5T73yp42qyuhJnSGNtBzhZXHltAw==" as const;

export const HISTORICAL_RULE_ARTIFACT_V09 = {
  schemaVersion: "rule_artifact_v0.9",
  releaseId: "rule-release-v0.9",
  artifactId: "rule-artifact-v0.9",
  manifestHash: "2a703c5d24cc22787fe55cefd7dd6629013c2e810300a96c1701279f574c8bd0",
  versions: {
    itemVersion: "v2.0", administrationVersion: "v0.1", scoringVersion: "v1.1",
    thresholdVersion: "threshold_v0.1", itemPatternVersion: "item_pattern_v0.3",
    diagnosisAssemblyVersion: "diagnosis_assembly_v0.2", expressionVersion: "fixed_v0.9",
    profileNarrativeVersion: "profile_narrative_v0.2", diagnosisActionLibraryVersion: "v0.2",
    actionSelectionVersion: "action_selection_v0.3", developmentPathwayVersion: "development_pathway_v0.4",
    reportStorylineVersion: "report_storyline_v0.1", pdfLayoutVersion: "pdf_layout_v0.2",
    reportTemplateVersion: "v0.9",
  },
  scoringPolicy: {
    rawScale: [1, 2, 3, 4, 5], standardizedValues: [0, 25, 50, 75, 100],
    dimensionRequiredItems: 3, dimensionTotalItems: 4, axisRequiredItems: 12,
    axisTotalItems: 16, impactRequiredItems: 7, impactTotalItems: 10,
    scoreBands: [45, 55, 70], classificationThresholds: { low: 45, middle: 55, high: 70 },
    workforceMinimumSample: 7, standardDepartmentSample: 30, anonymousResearchCellMinimum: 10,
  },
  components: [
    "questionnaire_v2.0", "scoring_v1.1", "threshold_v0.1", "item_pattern_v0.3",
    "diagnosis_assembly_v0.2", "diagnosis_action_library_v0.2", "action_selection_v0.3",
    "profile_narrative_v0.2", "report_storyline_v0.1", "report_template_v0.9",
    "pdf_layout_v0.2", "assessment_profile_v0.2", "development_pathway_v0.4",
  ],
  scientificBoundary:
    "This artifact freezes the executable product rules; it does not assert psychometric validation or intervention effectiveness.",
} as const;
export const HISTORICAL_RULE_ARTIFACT_V09_HASH =
  "10ff9353cf0b2f79329b6efc324f914d4616449de2fda23952eed5f7dd2d9c6e" as const;
export const HISTORICAL_RULE_ARTIFACT_V09_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAv0cbCkwkHQfgS1eohGA7X2ZwJQ5jO3AzI/BlLSpurAk=
-----END PUBLIC KEY-----
` as const;
export const HISTORICAL_RULE_ARTIFACT_V09_SIGNATURE =
  "/v/w4FjAPRKCgJ6TswgiKf9zlnFlmSBwC+85Evm06/B4wl33Gl23h54AnZt328xlPuaJPkWeWVuKPDjeqOROBA==" as const;

export const HISTORICAL_RULE_ARTIFACT_V08 = {
  schemaVersion: "rule_artifact_v0.8",
  releaseId: "rule-release-v0.8",
  artifactId: "rule-artifact-v0.8",
  manifestHash: "f4fbf5d2dbd199d7458b1f1d583a8e002a86d185879914f1e23b5998b9c4393d",
  versions: {
    itemVersion: "v2.0", administrationVersion: "v0.1", scoringVersion: "v1.1",
    thresholdVersion: "threshold_v0.1", itemPatternVersion: "item_pattern_v0.1",
    diagnosisAssemblyVersion: "diagnosis_assembly_v0.1", expressionVersion: "fixed_v0.8",
    profileNarrativeVersion: "profile_narrative_v0.1", diagnosisActionLibraryVersion: "v0.2",
    actionSelectionVersion: "action_selection_v0.2", developmentPathwayVersion: "development_pathway_v0.3",
    reportTemplateVersion: "v0.8",
  },
  scoringPolicy: {
    rawScale: [1, 2, 3, 4, 5], standardizedValues: [0, 25, 50, 75, 100],
    dimensionRequiredItems: 3, dimensionTotalItems: 4, axisRequiredItems: 12,
    axisTotalItems: 16, impactRequiredItems: 7, impactTotalItems: 10,
    scoreBands: [45, 55, 70], classificationThresholds: { low: 45, middle: 55, high: 70 },
    workforceMinimumSample: 7, standardDepartmentSample: 30, anonymousResearchCellMinimum: 10,
  },
  components: [
    "questionnaire_v2.0", "scoring_v1.1", "threshold_v0.1", "item_pattern_v0.1",
    "diagnosis_assembly_v0.1", "diagnosis_action_library_v0.2", "action_selection_v0.2",
    "profile_narrative_v0.1", "report_template_v0.8", "assessment_profile_v0.2",
    "development_pathway_v0.3",
  ],
  scientificBoundary:
    "This artifact freezes the executable product rules; it does not assert psychometric validation or intervention effectiveness.",
} as const;
export const HISTORICAL_RULE_ARTIFACT_V08_HASH =
  "9637ffb47075aacfde8bd0b9ff0735ded89a14a4fbb4dbd00b32b297b4b265f2" as const;
export const HISTORICAL_RULE_ARTIFACT_V08_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEATociXa7A/SeeZJbZDoHBRPmkNq2Y5mEH10mQVAndIEQ=
-----END PUBLIC KEY-----
` as const;
export const HISTORICAL_RULE_ARTIFACT_V08_SIGNATURE =
  "03tDRJnZ1TmkXo5vWcVO5hQSesyTn040v7K756Tjup9q7V/vJAM+hIJn+BHjynZnVLn/zu8XOGod1U87jR5dBg==" as const;

export const HISTORICAL_RULE_ARTIFACT_V07 = {
  schemaVersion: "rule_artifact_v0.7",
  releaseId: "rule-release-v0.7",
  artifactId: "rule-artifact-v0.7",
  manifestHash:
    "b7e1ff43ccfe646c505a817e6e03e3a903f9b59d774a5d2faab028ff67227368",
  versions: {
    itemVersion: "v2.0", administrationVersion: "v0.1", scoringVersion: "v1.1",
    thresholdVersion: "threshold_v0.1", itemPatternVersion: "item_pattern_v0.1",
    diagnosisAssemblyVersion: "diagnosis_assembly_v0.1", expressionVersion: "fixed_v0.7",
    profileNarrativeVersion: "profile_narrative_v0.1", diagnosisActionLibraryVersion: "v0.1",
    reportTemplateVersion: "v0.7",
  },
  scoringPolicy: {
    rawScale: [1, 2, 3, 4, 5], standardizedValues: [0, 25, 50, 75, 100],
    dimensionRequiredItems: 3, dimensionTotalItems: 4, axisRequiredItems: 12,
    axisTotalItems: 16, impactRequiredItems: 7, impactTotalItems: 10,
    scoreBands: [45, 55, 70], classificationThresholds: { low: 45, middle: 55, high: 70 },
    workforceMinimumSample: 7, standardDepartmentSample: 30, anonymousResearchCellMinimum: 10,
  },
  components: [
    "questionnaire_v2.0", "scoring_v1.1", "threshold_v0.1", "item_pattern_v0.1",
    "diagnosis_assembly_v0.1", "diagnosis_action_library_v0.1", "profile_narrative_v0.1",
    "report_template_v0.7", "assessment_profile_v0.2", "development_pathway_v0.2",
  ],
  scientificBoundary:
    "This artifact freezes the executable product rules; it does not assert psychometric validation or intervention effectiveness.",
} as const;
export const HISTORICAL_RULE_ARTIFACT_V07_HASH =
  "b22067a33271e0fae3a819416c203bb734ab8878d51dee5cd200dd08d13c55fd" as const;
export const HISTORICAL_RULE_ARTIFACT_V07_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAr0Hsex8nGdvCM6ORyFXRlOjvZeN4YBfHqknipscw7JY=
-----END PUBLIC KEY-----
` as const;
export const HISTORICAL_RULE_ARTIFACT_V07_SIGNATURE =
  "HfFAdOgu8HxCVFDKfJ4UXyB6Su72NF9XIT42s/JHQiSwXfY5FJFvyaHA2dWkrqN7zuAyRFSBjryhJIvzJIQRCg==" as const;

export const HISTORICAL_RULE_ARTIFACT_V06 = {
  schemaVersion: "rule_artifact_v0.6",
  releaseId: "rule-release-v0.6",
  artifactId: "rule-artifact-v0.6",
  manifestHash:
    "b3d535148e9f38df8a38f9224631974a20f9bebb113536cd0998ea826b1cfcc4",
  versions: {
    itemVersion: "v2.0", administrationVersion: "v0.1", scoringVersion: "v1.1",
    thresholdVersion: "threshold_v0.1", itemPatternVersion: "item_pattern_v0.1",
    diagnosisAssemblyVersion: "diagnosis_assembly_v0.1", expressionVersion: "fixed_v0.6",
    diagnosisActionLibraryVersion: "v0.1", reportTemplateVersion: "v0.6",
  },
  scoringPolicy: {
    rawScale: [1, 2, 3, 4, 5], standardizedValues: [0, 25, 50, 75, 100],
    dimensionRequiredItems: 3, dimensionTotalItems: 4, axisRequiredItems: 12,
    axisTotalItems: 16, impactRequiredItems: 7, impactTotalItems: 10,
    scoreBands: [45, 55, 70], classificationThresholds: { low: 45, middle: 55, high: 70 },
    workforceMinimumSample: 7, standardDepartmentSample: 30, anonymousResearchCellMinimum: 10,
  },
  components: [
    "questionnaire_v2.0", "scoring_v1.1", "threshold_v0.1", "item_pattern_v0.1",
    "diagnosis_assembly_v0.1", "diagnosis_action_library_v0.1", "report_template_v0.6",
    "assessment_profile_v0.2", "development_pathway_v0.2",
  ],
  scientificBoundary:
    "This artifact freezes the executable product rules; it does not assert psychometric validation or intervention effectiveness.",
} as const;
export const HISTORICAL_RULE_ARTIFACT_V06_HASH =
  "b82bf143f819adc9a6cde0ce682fbb3b11b4665ebc675c2ddeebed8db2dfb4e9" as const;
export const HISTORICAL_RULE_ARTIFACT_V06_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAXT1l7X953LbyYUw1gFJMEcMAd4xGtXdC7qJm5aGIsxY=
-----END PUBLIC KEY-----
` as const;
export const HISTORICAL_RULE_ARTIFACT_V06_SIGNATURE =
  "S6w7YrIrYdxtUHV7fJpdRLREHkSoit2ne2bW2vY+olKf+DbxJmiTSH2sdCHXbVeCtQVS+LVZZKEEPuYKctLWAw==" as const;

export const EXECUTABLE_RULE_ARTIFACT = {
  schemaVersion: "rule_artifact_v0.9.3",
  releaseId: BUILTIN_RULE_RELEASE_ID,
  artifactId: BUILTIN_RULE_ARTIFACT_ID,
  manifestHash: EXECUTABLE_RULESET_SHA256,
  versions: VERSION_TUPLE,
  scoringPolicy: {
    rawScale: [1, 2, 3, 4, 5],
    standardizedValues: [0, 25, 50, 75, 100],
    dimensionRequiredItems: 3,
    dimensionTotalItems: 4,
    axisRequiredItems: 12,
    axisTotalItems: 16,
    impactRequiredItems: 7,
    impactTotalItems: 10,
    scoreBands: [45, 55, 70],
    classificationThresholds: { low: 45, middle: 55, high: 70 },
    workforceMinimumSample: WORKFORCE_MINIMUM_SAMPLE,
    standardDepartmentSample: STANDARD_GROUP_SAMPLE,
    anonymousResearchCellMinimum: 10,
  },
  components: [
    "questionnaire_v2.0",
    "scoring_v1.1",
    "threshold_v0.2",
    "item_pattern_v0.4",
    "diagnosis_assembly_v0.2",
    "diagnosis_action_library_v0.3",
    "action_selection_v0.3.1",
    "profile_narrative_v0.4",
    "report_storyline_v0.2",
    "report_template_v0.9.3",
    "pdf_layout_v0.4",
    "assessment_profile_v0.2",
    "development_pathway_v0.6",
  ],
  scientificBoundary:
    "This artifact freezes the executable product rules; it does not assert psychometric validation or intervention effectiveness.",
} as const;
export const HISTORICAL_RULE_ARTIFACT_V05 = {
  schemaVersion: "rule_artifact_v0.5",
  releaseId: "rule-release-v0.5",
  artifactId: "rule-artifact-v0.5",
  manifestHash:
    "b512b173f7a26861e869a0630d3052044fe80ac02ccc52dfbebb7ead31cc7b36",
  versions: {
    itemVersion: "v2.0", administrationVersion: "v0.1", scoringVersion: "v1.1",
    thresholdVersion: "threshold_v0.1", itemPatternVersion: "item_pattern_v0.1",
    diagnosisAssemblyVersion: "diagnosis_assembly_v0.1", expressionVersion: "fixed_v0.5",
    diagnosisActionLibraryVersion: "v0.1", reportTemplateVersion: "v0.5",
  },
  scoringPolicy: HISTORICAL_SCORING_POLICY_V01,
  components: [
    "questionnaire_v2.0", "scoring_v1.1", "threshold_v0.1", "item_pattern_v0.1",
    "diagnosis_assembly_v0.1", "diagnosis_action_library_v0.1",
    "report_template_v0.5", "assessment_profile_v0.2", "development_pathway_v0.2",
  ],
  scientificBoundary: EXECUTABLE_RULE_ARTIFACT.scientificBoundary,
} as const;
export const HISTORICAL_RULE_ARTIFACT_V05_HASH =
  "01273785a06cfeab846b37a9a095f85bb31730817bd89efb1f8a3e7b3033dac8" as const;
export const HISTORICAL_RULE_ARTIFACT_V05_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEABDty/bySIvtLC+FdCX9KR8Fouff36SY9QhENlmPxbiQ=
-----END PUBLIC KEY-----
` as const;
export const HISTORICAL_RULE_ARTIFACT_V05_SIGNATURE =
  "Ku13lnGQ892S2KUjsw2s+1Nk+ED6vnH5Gmj+Ov85nlxBR/NCKPLVMdIKhIiy8cZM0H0Rfe/o+ILTAVkA9mNFCg==" as const;
export const HISTORICAL_RULE_ARTIFACT_V04 = {
  schemaVersion: "rule_artifact_v0.4",
  releaseId: "rule-release-v0.4",
  artifactId: "rule-artifact-v0.4",
  manifestHash:
    "3b561ec21881295bbe92a1dc9aa42b7aea7f823348a46f4c492eaa2c1e364f6f",
  versions: {
    itemVersion: "v2.0", administrationVersion: "v0.1", scoringVersion: "v1.1",
    thresholdVersion: "threshold_v0.1", itemPatternVersion: "item_pattern_v0.1",
    diagnosisAssemblyVersion: "diagnosis_assembly_v0.1", expressionVersion: "fixed_v0.4",
    diagnosisActionLibraryVersion: "v0.1", reportTemplateVersion: "v0.4",
  },
  scoringPolicy: HISTORICAL_SCORING_POLICY_V01,
  components: [
    "questionnaire_v2.0", "scoring_v1.1", "threshold_v0.1", "item_pattern_v0.1",
    "diagnosis_assembly_v0.1", "diagnosis_action_library_v0.1",
    "report_template_v0.4", "development_pathway_v0.2",
  ],
  scientificBoundary: EXECUTABLE_RULE_ARTIFACT.scientificBoundary,
} as const;
export const HISTORICAL_RULE_ARTIFACT_V04_HASH =
  "cd0cea2a5f486fc89b836da688d5e98cf05f6551afd5d811004aa32b729ad078" as const;
export const HISTORICAL_RULE_ARTIFACT_V04_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAoQzntWHhrTTtIS52eZ2xu2c1Okutmq3Wacwy0Rfz5MY=
-----END PUBLIC KEY-----
` as const;
export const HISTORICAL_RULE_ARTIFACT_V04_SIGNATURE =
  "/yjAlNcbutlRvQo/X5C5eZICWq0p/uVah2ZxN+pmxSp3YyMxdN0yNwpK6n9bvXHB+vhJYpbM1G1wWvb1M8DyAQ==" as const;
export const HISTORICAL_RULE_ARTIFACT_V03 = {
  schemaVersion: "rule_artifact_v0.3",
  releaseId: "rule-release-v0.3",
  artifactId: "rule-artifact-v0.3",
  manifestHash:
    "7915c7c3b3418916afdb3c08a3a5527ab0b511f5d43f0f41ffb574f0f6ad512a",
  versions: {
    itemVersion: "v2.0", administrationVersion: "v0.1", scoringVersion: "v1.1",
    thresholdVersion: "threshold_v0.1", itemPatternVersion: "item_pattern_v0.1",
    diagnosisAssemblyVersion: "diagnosis_assembly_v0.1", expressionVersion: "fixed_v0.3",
    diagnosisActionLibraryVersion: "v0.1", reportTemplateVersion: "v0.3",
  },
  scoringPolicy: HISTORICAL_SCORING_POLICY_V01,
  components: [
    "questionnaire_v2.0", "scoring_v1.1", "threshold_v0.1", "item_pattern_v0.1",
    "diagnosis_assembly_v0.1", "diagnosis_action_library_v0.1",
    "report_template_v0.3", "development_pathway_v0.2",
  ],
  scientificBoundary: EXECUTABLE_RULE_ARTIFACT.scientificBoundary,
} as const;
export const HISTORICAL_RULE_ARTIFACT_V03_HASH =
  "6684956f437ea294fa2cc294822744ce2fcde0a62afaf685de4eb62b13ebff53" as const;
export const HISTORICAL_RULE_ARTIFACT_V03_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAtdjfRCN1yx0ZwnI1T8fwkR2jX4tmgR0z1etXP9F5siA=
-----END PUBLIC KEY-----
` as const;
export const HISTORICAL_RULE_ARTIFACT_V03_SIGNATURE =
  "aa7rK43Qy2EnCOGfCqAXB0M7dK01/05GiZEVDdFcyVPsFWr1NuQdzFsQDPRPiAR8H9n30yrLrE6c0DBUU72GBg==" as const;
export const HISTORICAL_RULE_ARTIFACT_V02 = {
  schemaVersion: "rule_artifact_v0.2",
  releaseId: "rule-release-v0.2",
  artifactId: "rule-artifact-v0.2",
  manifestHash: "3ab2aadcffa7d554391c009770e1afc06023b792ad93d243d2d4fbce16971fb1",
  versions: {
    itemVersion: "v2.0", administrationVersion: "v0.1", scoringVersion: "v1.1",
    thresholdVersion: "threshold_v0.1", itemPatternVersion: "item_pattern_v0.1",
    diagnosisAssemblyVersion: "diagnosis_assembly_v0.1", expressionVersion: "fixed_v0.2",
    diagnosisActionLibraryVersion: "v0.1", reportTemplateVersion: "v0.2",
  },
  scoringPolicy: HISTORICAL_SCORING_POLICY_V01,
  components: [
    "questionnaire_v2.0", "scoring_v1.1", "threshold_v0.1", "item_pattern_v0.1",
    "diagnosis_assembly_v0.1", "diagnosis_action_library_v0.1",
    "report_template_v0.2", "development_pathway_v0.1",
  ],
  scientificBoundary: EXECUTABLE_RULE_ARTIFACT.scientificBoundary,
} as const;
export const HISTORICAL_RULE_ARTIFACT_V02_HASH =
  "804f7622333521c22989836dfa0263713f1018e86bef5a3cda51d977b4843b56" as const;
export const HISTORICAL_RULE_ARTIFACT_V02_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEARkrUn+iEAqnnE5nknTh++1juSO32b6HZrhZUARuZ+7Y=
-----END PUBLIC KEY-----
` as const;
export const HISTORICAL_RULE_ARTIFACT_V02_SIGNATURE =
  "5nqvJOPgmNofpISFn9vvMYw8VGeUCklKMWctbnp9IFIGSoJRwbjSPtbe+wm2xljWatc95ZnJJKTewLGQXNT4DA==" as const;
export const EMPLOYEE_PRIVACY_NOTICE_VERSION =
  "employee_privacy_notice_v0.1" as const;
export const PERSONAL_RESEARCH_NOTICE_VERSION =
  "personal_research_notice_v0.1" as const;

export type AssessmentTarget = "personal" | "organization" | "combined";
export type OrganizationMethod =
  "workforce_survey" | "single_manager_self_assessment";
export type AssessmentProfileId =
  | "personal_iv_v0.1"
  | "personal_iov_observer_v0.1"
  | "organization_o_workforce_v0.1"
  | "organization_o_manager_v0.1"
  | "combined_iov_v0.1";
export type QuestionnairePackageId =
  | "personal_iv_v0.1"
  | "organization_o_v0.1"
  | "combined_iov_v0.1";

export const PUBLIC_PERSONAL_ASSESSMENT_PROFILES = [
  "personal_iv_v0.1",
  "personal_iov_observer_v0.1",
] as const satisfies readonly AssessmentProfileId[];

export function assessmentConfigurationFor(
  target: AssessmentTarget,
  organizationMethod: OrganizationMethod = "workforce_survey",
): {
  assessmentProfileId: AssessmentProfileId;
  questionnairePackageId: QuestionnairePackageId;
} {
  if (target === "personal")
    return {
      assessmentProfileId: "personal_iv_v0.1",
      questionnairePackageId: "personal_iv_v0.1",
    };
  if (target === "organization")
    return {
      assessmentProfileId:
        organizationMethod === "single_manager_self_assessment"
          ? "organization_o_manager_v0.1"
          : "organization_o_workforce_v0.1",
      questionnairePackageId: "organization_o_v0.1",
    };
  return {
    assessmentProfileId: "combined_iov_v0.1",
    questionnairePackageId: "combined_iov_v0.1",
  };
}

export function publicPersonalAssessmentConfiguration(
  assessmentProfileId: (typeof PUBLIC_PERSONAL_ASSESSMENT_PROFILES)[number],
): {
  target: AssessmentTarget;
  organizationMethod: OrganizationMethod;
  assessmentProfileId: AssessmentProfileId;
  questionnairePackageId: QuestionnairePackageId;
} {
  return assessmentProfileId === "personal_iov_observer_v0.1"
    ? {
        target: "combined",
        organizationMethod: "workforce_survey",
        assessmentProfileId,
        questionnairePackageId: "combined_iov_v0.1",
      }
    : {
        target: "personal",
        organizationMethod: "workforce_survey",
        assessmentProfileId,
        questionnairePackageId: "personal_iv_v0.1",
      };
}
export type CampaignMode = "anonymous" | "identified";
export type EvidenceBasis =
  | "individual_self_assessment"
  | "workforce_aggregate"
  | "single_manager_self_assessment";
export type CampaignStatus =
  "draft" | "scheduled" | "active" | "closed" | "cancelled" | "archived";
export type MetricStatus = "scored" | "insufficient" | "not_applicable";
export type ClassificationId =
  "FRONTIER" | "BLOCKED_AGENCY" | "UNCLAIMED_CAPACITY" | "STALLED" | "EMERGENT";
export type DimensionId = "A1" | "A2" | "A3" | "A4" | "B1" | "B2" | "B3" | "B4";
export type ItemId = `I${string}` | `O${string}` | `V${string}`;
export type RawAnswer = 1 | 2 | 3 | 4 | 5 | null;
export type BackgroundAnswer = string;
export type CustomQuestionType =
  | "single_choice"
  | "multiple_choice"
  | "short_text";
export interface CustomQuestionSnapshot {
  id: string;
  type: CustomQuestionType;
  text: string;
  required: boolean;
  options: Array<{ value: string; label: string }>;
}
export type CustomAnswer = string | string[];
export type EnterpriseRole = "owner" | "hr_admin" | "manager" | "employee";
export type LoginIntent = "personal" | "enterprise" | "platform";
export type WorkspaceKind = "personal" | "organization" | "platform";
export type PlatformRole =
  | "platform_admin"
  | "research_admin"
  | "security_auditor";
export type EnterpriseApplicationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "suspended";
export interface WorkspaceMembership {
  organizationId: string;
  organizationName: string;
  userId: string;
  role: EnterpriseRole;
  status: "active" | "suspended";
}
export interface AccountSession {
  authenticated: true;
  account: {
    id: string;
    displayName: string | null;
    email: string | null;
  };
  activeWorkspace: {
    kind: WorkspaceKind;
    organizationId: string | null;
  };
  personal: { available: true };
  organizations: WorkspaceMembership[];
  platformRoles: PlatformRole[];
  tenant: { id: string; name: string };
  user: {
    id: string;
    name: string;
    email: string | null;
    role: EnterpriseRole;
  };
  authentication: "development_mock" | "feishu_oauth" | "email_otp";
}
export interface EnterpriseApplication {
  id: string;
  accountId: string;
  applicantName: string;
  applicantRole: string;
  organizationName: string;
  website: string | null;
  expectedHeadcountBand: string;
  useCase: string;
  status: EnterpriseApplicationStatus;
  organizationId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export type ProductJob =
  | { name: "activate-due-campaigns"; data: { now?: string } }
  | { name: "close-due-campaigns"; data: { now?: string } }
  | { name: "process-completion-receipts"; data: { now?: string } }
  | { name: "render-pdf"; data: { tenantId: string; reportId: string } }
  | {
      name: "send-notification";
      data: {
        tenantId: string;
        notificationId: string;
        openId: string;
        card: object;
      };
    }
  | { name: "replay-report"; data: { tenantId: string; reportId: string } }
  | {
      name: "delete-subject-data";
      data: {
        requestId: string;
        tenantId: string;
        subjectRefHashes: string[];
        requestedBy: string;
        reason: string;
      };
    };

export interface AuthContext {
  accountId?: string;
  tenantId: string;
  tenantName: string;
  userId: string;
  userName: string;
  role: EnterpriseRole;
  authentication: "development_mock" | "feishu_oauth" | "email_otp";
  workspaceKind?: WorkspaceKind;
  platformRoles?: PlatformRole[];
}
export interface EnterpriseUser {
  id: string;
  tenantId: string;
  displayName: string;
  emailMasked?: string | null;
  role: EnterpriseRole;
}

export interface PersonalResearchProfileInput {
  workCity: string;
  province: string;
  industryCode: string;
  companySizeBand:
    | "<50"
    | "50—199"
    | "200—499"
    | "500—999"
    | "1000—4999"
    | "≥5000"
    | "unknown"
    | "prefer_not_to_say";
  jobFamily: PersonContextMappingInput["jobFamily"] | "prefer_not_to_say";
  careerStage:
    | PersonContextMappingInput["careerStage"]
    | "prefer_not_to_say";
  peopleManager: boolean | null;
  tenureBand: PersonContextMappingInput["tenureBand"] | "prefer_not_to_say";
  researchConsent: boolean;
  noticeVersion: typeof PERSONAL_RESEARCH_NOTICE_VERSION;
  consentedAt: string | null;
}

export interface PersonalResearchProfile extends PersonalResearchProfileInput {
  id: string;
  tenantId: string;
  userId: string;
  updatedAt: string;
}
export interface DirectorySubject {
  externalSubjectId: string;
  displayName: string;
  departmentIds: string[];
  active: boolean;
}
export interface DirectoryDepartment {
  externalDepartmentId: string;
  name: string;
  parentExternalDepartmentId: string | null;
}
export interface EnterpriseDirectory {
  subjects: DirectorySubject[];
  departments: DirectoryDepartment[];
  lastSyncedAt: string | null;
}
export interface QuestionnaireRelease {
  id: string;
  tenantId: string;
  campaignId: string;
  items: Array<{
    id: string;
    dimensionId: DimensionId | "C";
    text: string;
    unavailableLabel: string;
  }>;
  backgroundItems: Array<{
    id: "BG01" | "BG02" | "BG03";
    text: string;
    options: Array<{ value: string; label: string }>;
  }>;
  customItems: CustomQuestionSnapshot[];
  scale: Array<{ value: 1 | 2 | 3 | 4 | 5; label: string }>;
  versions: typeof VERSION_TUPLE;
  ruleManifestHash: typeof EXECUTABLE_RULESET_SHA256;
  contentHash: string;
  createdAt: string;
}
export interface CampaignScheduleAmendment {
  id: string;
  tenantId: string;
  campaignId: string;
  sequence: number;
  previousClosesAt: string;
  newClosesAt: string;
  reason: string;
  createdBy: string;
  createdAt: string;
}
export interface ReportArtifact {
  id: string;
  tenantId: string;
  reportSnapshotId: string;
  artifactType: "pdf";
  storageKey: string;
  contentHash: string;
  byteSize: number;
  mimeType: "application/pdf";
  createdAt: string;
}
export interface PersonContextMappingInput {
  externalSubjectId: string;
  source: "feishu" | "hris" | "admin_upload";
  jobFamily:
    | "management_strategy"
    | "product_project"
    | "engineering_data_research"
    | "design_content_creative"
    | "marketing_brand_growth"
    | "sales_business_customer_success"
    | "operations_supply_production_delivery"
    | "finance_legal_risk_audit"
    | "people_admin_procurement_support"
    | "frontline_other"
    | "unknown";
  careerStage:
    | "junior_ic"
    | "experienced_ic"
    | "senior_expert"
    | "frontline_manager"
    | "middle_manager"
    | "senior_manager"
    | "other_unknown";
  peopleManager: boolean | null;
  tenureBand:
    "under_1y" | "1_to_2y" | "3_to_5y" | "6_to_10y" | "over_10y" | "unknown";
  province: string;
  employmentType: string;
  inTargetPopulation: boolean;
  rawContext?: Record<string, string | number | boolean | null>;
}

export interface PersonContextCohortSnapshot {
  cohortKey: string;
  context: {
    jobFamily: PersonContextMappingInput["jobFamily"];
    careerStage?: PersonContextMappingInput["careerStage"];
    tenureBand?: PersonContextMappingInput["tenureBand"];
    province?: string;
  };
  memberCount: number;
  protectionStatus: "included" | "suppressed";
  coarseningLevel: number;
}
export interface OrganizationResearchProfile {
  tenantId: string;
  country: "CN";
  headquartersProvince: string;
  industryRaw: string;
  industryStandardCode: string;
  industryMappingVersion: string;
  headcount: number;
  headcountBand:
    "<50" | "50—199" | "200—499" | "500—999" | "1000—4999" | "≥5000";
  aiStage:
    | "not_started"
    | "local_exploration"
    | "multi_team"
    | "company_wide"
    | "core_workflows";
  aiStartDuration:
    "not_started" | "under_6m" | "6m_to_1y" | "1_to_2y" | "over_2y";
  questionnaireLanguage: string;
  primaryWorkLanguage: string;
  updatedAt: string;
}
export interface NormAuthorization {
  tenantId: string;
  status: "authorized" | "revoked";
  noticeVersion: string;
  updatedAt: string;
}

export interface MetricValue {
  value: number | null;
  status: MetricStatus;
  validCount: number;
  totalCount: number;
}

export interface ScoreSnapshot {
  id: string;
  createdAt: string;
  versions: typeof VERSION_TUPLE;
  answers: Record<string, RawAnswer>;
  items: Record<string, number | null>;
  dimensions: Record<DimensionId, MetricValue>;
  employeeAiCapability: MetricValue;
  organizationalAiReadiness: MetricValue;
  realizedAiImpact: MetricValue;
  classificationId: ClassificationId | null;
  inputHash: string;
}

export interface CampaignSnapshot {
  id: string;
  tenantId: string;
  name: string;
  target: AssessmentTarget;
  organizationMethod: OrganizationMethod;
  assessmentProfileId: AssessmentProfileId;
  questionnairePackageId: QuestionnairePackageId;
  mode: CampaignMode;
  status: CampaignStatus;
  startsAt: string;
  closesAt: string;
  backgroundItemIds: string[];
  customItems: CustomQuestionSnapshot[];
  invitedCount: number;
  baselineCampaignId: string | null;
  designatedAssessorExternalId: string | null;
  versions: typeof VERSION_TUPLE;
}

export interface CampaignRecord extends CampaignSnapshot {
  createdAt: string;
  submittedCount: number;
  validCount: number;
}

export interface CreateCampaignInput {
  name: string;
  target: AssessmentTarget;
  organizationMethod?: OrganizationMethod;
  mode: CampaignMode;
  startsAt: string;
  closesAt: string;
  backgroundItemIds?: string[];
  customItems?: CustomQuestionSnapshot[];
  invitedCount?: number;
  baselineCampaignId?: string | null;
  designatedAssessorExternalId?: string | null;
}

export type UpdateCampaignInput = CreateCampaignInput;

export interface ResponseSubmission {
  id: string;
  tenantId: string;
  campaignId: string;
  participantRef: string | null;
  answers: Record<string, RawAnswer>;
  backgroundAnswers: Record<string, BackgroundAnswer>;
  customAnswers: Record<string, CustomAnswer>;
  submittedAt: string;
  responseHash: string;
  privacyNoticeVersion?: typeof EMPLOYEE_PRIVACY_NOTICE_VERSION | null;
  consentedAt?: string | null;
}
export interface ResponseDraft {
  campaignId: string;
  answers: Record<string, RawAnswer>;
  backgroundAnswers: Record<string, BackgroundAnswer>;
  customAnswers: Record<string, CustomAnswer>;
  clientRevision: number;
  updatedAt: string;
}

export type ReportType =
  | "immediate_personal"
  | "second_stage_personal"
  | "personal_scoped"
  | "personal_observer"
  | "organization"
  | "organization_scoped"
  | "manager_self_assessment"
  | "employee_organization_summary";

export interface ReportInsight {
  dimensionId: DimensionId;
  label: string;
  score: number;
  summary: string;
  itemSignal?: string;
}

export type ReportMetricId =
  | "employeeAiCapability"
  | "organizationalAiReadiness"
  | "realizedAiImpact";

export interface ReportMetricNarrative {
  metricId: ReportMetricId;
  label: string;
  value: number | null;
  levelId: "S1" | "S2" | "S3" | "S4" | null;
  levelLabel: string;
  description: string;
}

export type ItemPatternAudience = "personal" | "organization" | "manager";
export type SuppressionReasonCode =
  | "invalid_or_missing"
  | "threshold_not_met"
  | "paired_sample_insufficient"
  | "multi_compression"
  | "display_limit"
  | "duplicate_semantics";
export interface ItemSignalStat {
  itemId: string;
  itemScore: number | null;
  dimensionScore: number | null;
  internalDifference?: number;
  pairedValidN?: number;
  pairedMeanDifference?: number | null;
  lowResponseRatio?: number | null;
  highResponseRatio?: number | null;
}
export interface SuppressedItem {
  itemId: string;
  reasonCode: SuppressionReasonCode;
  stats: ItemSignalStat;
}
export type ItemDistributionType =
  | "uniform_high"
  | "uniform_mid_high"
  | "uniform_mid_low"
  | "uniform_low"
  | "mixed_polarized"
  | "insufficient";
export interface ItemDistributionStats {
  validCount: number;
  minimum: number | null;
  maximum: number | null;
  mean: number | null;
  spread: number | null;
  lowCount: number;
  highCount: number;
}
export interface ItemPatternRecord {
  dimensionId: DimensionId;
  audience: ItemPatternAudience;
  distributionType: ItemDistributionType;
  distributionStats: ItemDistributionStats;
  distributionFragmentIds: string[];
  evidenceIds: string[];
  patternIds: string[];
  validItemIds: string[];
  itemSignalStats: ItemSignalStat[];
  developmentFragmentIds: string[];
  strengthFragmentIds: string[];
  fallbackIds: string[];
  suppressedItems: SuppressedItem[];
  visibleText: string[];
  ruleVersion: typeof VERSION_TUPLE.itemPatternVersion;
}
export interface AssembledDiagnosis {
  diagnosisId: string | null;
  dimensionId: DimensionId;
  audience: ItemPatternAudience;
  band: "S1" | "S2" | "S3" | "S4" | null;
  statusId: string | null;
  coreSummary: string | null;
  patternIds: string[];
  fragmentIds: string[];
  fallbackIds: string[];
  visibleText: string[];
  boundaryText: string;
  evidenceIds: string[];
  assemblyVersion: typeof VERSION_TUPLE.diagnosisAssemblyVersion;
}

export interface BehaviorEvidenceSnapshot {
  dimensionId: DimensionId;
  score: number | null;
  distributionType: ItemDistributionType;
  distributionStats: ItemDistributionStats;
  strengthBehaviors: string[];
  developmentBehaviors: string[];
  overallMeaning: string;
  concreteBehavior: string;
  impactOrRisk: string;
  boundary: string;
  sourceFragmentIds: string[];
  evidenceIds: string[];
}

export interface ReportAxisStage {
  metricId: ReportMetricId;
  value: number | null;
  levelId: "S1" | "S2" | "S3" | "S4" | null;
  stageLabel: string;
  interpretation: string;
}

export interface ReportStoryline {
  version: typeof VERSION_TUPLE.reportStorylineVersion;
  headline: string;
  currentState: string;
  formedBehaviorSummary: string;
  keyTension: string;
  nextStageTheme: string;
  boundary: string;
  axisStages: ReportAxisStage[];
  strengthDimensionIds: DimensionId[];
  developmentDimensionIds: DimensionId[];
  actionPriorityDimensionIds: DimensionId[];
  evidenceIds: string[];
  qualityFlags: string[];
}

export interface DepartmentBenchmark {
  departmentId: string;
  label: string;
  sampleSize: number;
  sampleStatus: "directional" | "standard";
  employeeAiCapability: number | null;
  organizationalAiReadiness: number | null;
  realizedAiImpact: number | null;
  classificationId: ClassificationId | null;
  dimensions: Record<DimensionId, number | null>;
}

export interface OrganizationBenchmark {
  sampleSize: number;
  sampleStatus: "directional" | "standard";
  metrics: {
    employeeAiCapability: number | null;
    organizationalAiReadiness: number | null;
    realizedAiImpact: number | null;
  };
  dimensions: Record<DimensionId, number | null>;
  classificationDistribution: Partial<
    Record<ClassificationId, { count: number; percentage: number }>
  >;
  departments: DepartmentBenchmark[];
}

export interface RetestComparison {
  baselineCampaignId: string;
  baselineReportId: string;
  baselineCreatedAt: string;
  baselineSampleSize: number;
  currentSampleSize: number;
  metrics: {
    employeeAiCapability: number | null;
    organizationalAiReadiness: number | null;
    realizedAiImpact: number | null;
  };
  dimensions: Record<DimensionId, number | null>;
  caveat: string;
}

export interface RecommendationSnapshot {
  id: string;
  dimensionId: DimensionId;
  priority: number;
  title: string;
  rationale: string;
  action: string;
  successSignal: string;
  suggestedLead: string;
  suggestedWindow: string;
  evidenceIds: string[];
  triggerFacts: string[];
  requiredFragmentIds: string[];
  actionFamily: string;
  leadMode: "individual" | "shared" | "organization";
  evidenceStrength: "B" | "C" | "D";
  sourceStatus: "draft";
  releaseEligible: false;
  priorityScore: number;
  isSafetyPrerequisite: boolean;
  isScalingAction: boolean;
  isMeasurementAction: boolean;
  actionMode?: "improve" | "stabilize" | "validate" | "scale";
  selectionReason?: string;
}

export interface DevelopmentPathwayStep {
  id: string;
  dimensionIds: DimensionId[];
  title: string;
  description: string;
  outcome: string;
  mode: "improve" | "stabilize" | "validate" | "scale";
  relatedRecommendationIds: string[];
}

export interface ActionRuleAudit {
  recommendationId: string;
  status: "qualified" | "selected" | "suppressed";
  reasonCodes: Array<
    | "trigger_not_met"
    | "scaling_prerequisite_blocked"
    | "duplicate_action_family"
    | "individual_action_limit"
    | "same_dimension_limit"
    | "priority_display_limit"
  >;
  triggerFacts: string[];
}
export interface EvidenceReference {
  id: string;
  title: string;
  sourceType: "source_research" | "official_framework" | "empirical_research" | "evidence_synthesis" | "professional_guidance";
  url: string;
  supports: string;
  boundary: string;
}

export type ProfileNarrativeBlockKind =
  | "integrated_state"
  | "working_chain"
  | "breakpoint_impact"
  | "next_priority"
  | "overall_state"
  | "formed_behaviors"
  | "key_breakpoints"
  | "boundary";

export interface ProfileNarrativeBlock {
  kind: ProfileNarrativeBlockKind;
  text: string;
  metricIds: ReportMetricId[];
  dimensionIds: DimensionId[];
  diagnosisIds: string[];
  patternIds: string[];
  fragmentIds: string[];
  fallbackIds: string[];
  evidenceIds: string[];
}

export interface ProfileNarrative {
  version: typeof VERSION_TUPLE.profileNarrativeVersion;
  archetypeId: string;
  headline: string;
  paragraphs: ProfileNarrativeBlock[];
  boundaryNotice?: ProfileNarrativeBlock;
  evidenceIds: string[];
  qualityFlags: string[];
}

export interface ObserverOrganizationNoActionReason {
  reasonCode:
    | "high_support_no_specific_breakpoint"
    | "high_support_insufficient_specific_evidence"
    | "organization_data_insufficient"
    | "priority_or_responsibility_boundary";
  title: string;
  explanation: string;
  watchFor: string;
  dimensionIds: DimensionId[];
  fragmentIds: string[];
  evidenceIds: string[];
}

export interface ReportContentQuality {
  status: "passed";
  checks: string[];
}

export interface ReportSnapshot {
  id: string;
  tenantId: string;
  campaignId: string;
  responseId: string | null;
  reportType: ReportType;
  createdAt: string;
  status: "draft" | "published";
  evidenceBasis: EvidenceBasis;
  evidenceBoundary: string;
  subjectLabel: string;
  sampleSize: number;
  score: ScoreSnapshot;
  headline: string;
  overview: string;
  metricNarratives?: ReportMetricNarrative[];
  resultNarrative: string;
  classificationNarrative: string | null;
  organizationBenchmark: OrganizationBenchmark | null;
  retestComparison: RetestComparison | null;
  strengths: ReportInsight[];
  developmentAreas: ReportInsight[];
  overallProfile: string[];
  profileNarrative?: ProfileNarrative;
  behaviorEvidence?: BehaviorEvidenceSnapshot[];
  storyline?: ReportStoryline;
  contentQuality?: ReportContentQuality;
  observerOrganizationNoActionReason?: ObserverOrganizationNoActionReason;
  developmentPathway?: DevelopmentPathwayStep[];
  itemPatternRecords: ItemPatternRecord[];
  diagnoses: AssembledDiagnosis[];
  systemPlan: RecommendationSnapshot[];
  recommendations: RecommendationSnapshot[];
  actionRuleAudit: ActionRuleAudit[];
  evidenceReferences: EvidenceReference[];
  contentHashAlgorithm: "canonical_json_sha256_v1";
  ruleManifestHash: typeof EXECUTABLE_RULESET_SHA256;
  contentHash: string;
  versions: typeof VERSION_TUPLE;
}
export interface PersonalReportListItem {
  report: ReportSnapshot;
  campaignName: string;
  workspaceKind?: "personal" | "organization";
  organizationId?: string | null;
  organizationName?: string | null;
}

export interface ActionPlanItem {
  id: string;
  tenantId: string;
  campaignId: string;
  sourceReportId: string;
  recommendationId: string;
  dimensionId: DimensionId;
  title: string;
  owner: string;
  startsAt: string;
  dueAt: string;
  successMetric: string;
  resources: string;
  milestones: ActionMilestone[];
  evidenceIds: string[];
  evidenceReferences: EvidenceReference[];
  riskConditions: string[];
  retestAt: string;
  status: "planned" | "active" | "completed" | "cancelled";
  progressPercent: number;
  latestUpdate: string | null;
  updatedAt: string;
}
export interface ActionPlanListItem extends ActionPlanItem {
  campaignName: string;
}

export interface CreateActionPlanInput {
  recommendationId: string;
  title: string;
  owner: string;
  startsAt: string;
  dueAt: string;
  successMetric: string;
  resources: string;
  milestones: Array<{ title: string; dueAt: string }>;
  retestAt: string;
}

export interface ActionMilestone {
  id: string;
  title: string;
  dueAt: string;
  status: "pending" | "completed";
}

export interface ActionCheckIn {
  id: string;
  tenantId: string;
  actionPlanItemId: string;
  progressPercent: number;
  note: string;
  createdBy: string;
  createdAt: string;
}

export interface ReportPublication {
  id: string;
  tenantId: string;
  reportSnapshotId: string;
  audience: "employee" | "manager" | "organization";
  status: "reviewed" | "published" | "superseded";
  reviewedBy: string;
  reviewedAt: string;
  publishedBy: string;
  publishedAt: string;
  supersededAt: string | null;
}

export interface ReportAccessGrant {
  id: string;
  tenantId: string;
  reportSnapshotId: string;
  granteeUserId: string;
  operations: Array<"view" | "download">;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface ReportAccessGrantListItem extends ReportAccessGrant {
  granteeDisplayName: string;
  granteeRole: EnterpriseRole;
  grantedBy: string | null;
  grantedAt: string;
}

export interface IndividualReportGrant {
  id: string;
  tenantId: string;
  campaignId: string;
  granteeUserId: string;
  granteeDisplayName: string;
  operations: Array<"view" | "download">;
  expiresAt: string | null;
  revokedAt: string | null;
  grantedBy: string;
  grantedAt: string;
}

export interface IndividualReportListItem {
  reportId: string;
  campaignId: string;
  externalSubjectId: string;
  subjectDisplayName: string;
  reportType:
    | "immediate_personal"
    | "second_stage_personal"
    | "personal_scoped"
    | "personal_observer";
  createdAt: string;
}

export interface DataDeletionRequest {
  id: string;
  tenantId: string;
  requestedBy: string | null;
  requesterKind: "authenticated_subject" | "anonymous_report_holder";
  status: "queued" | "processing" | "completed" | "failed";
  reason: string;
  subjectCount: number;
  result: {
    responseCount: number;
    reportCount: number;
    draftCount: number;
    artifactCount: number;
    manifest: Array<{
      system: "object_storage" | "database" | "audit_log";
      status: "deleted" | "retained";
      affectedCount: number;
      note: string;
    }>;
  } | null;
  errorCode: string | null;
  requestedAt: string;
  updatedAt: string;
  completedAt: string | null;
}
