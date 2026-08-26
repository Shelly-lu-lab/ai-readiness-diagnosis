import type {
  DimensionId,
  MetricValue,
  ReportMetricNarrative,
  ReportSnapshot,
} from "@ai-readiness/contracts";
import { DIMENSION_LABELS } from "@ai-readiness/reporting/content";

const combinedIds: DimensionId[] = [
  "A1",
  "A2",
  "A3",
  "A4",
  "B4",
  "B3",
  "B2",
  "B1",
];
const personalIds: DimensionId[] = ["A1", "A2", "A3", "A4"];
const organizationIds: DimensionId[] = ["B1", "B2", "B3", "B4"];
const organizationOnlyTypes: ReportSnapshot["reportType"][] = [
  "organization_scoped",
  "manager_self_assessment",
  "employee_organization_summary",
];
const classificationLabels = {
  FRONTIER: "前沿区",
  BLOCKED_AGENCY: "能力受阻区",
  UNCLAIMED_CAPACITY: "组织待激活区",
  STALLED: "停滞区",
  EMERGENT: "涌现区",
} as const;
const pathwayModeLabels = {
  improve: "优先改善",
  stabilize: "建立稳定做法",
  validate: "验证真实效果",
  scale: "有边界地扩展",
} as const;
const actionModeLabels = {
  improve: "优先改善",
  stabilize: "稳定做法",
  validate: "验证效果",
  scale: "有边界扩展",
} as const;
const profileBlockLabels = {
  integrated_state: "你目前处在什么状态",
  working_chain: "哪些做法已经连成工作链",
  breakpoint_impact: "工作链断在哪里，会带来什么影响",
  next_priority: "下一步为什么先做这些",
  overall_state: "整体状态",
  formed_behaviors: "已经形成的做法",
  key_breakpoints: "接下来最要紧的地方",
  boundary: "如何理解这份结果",
} as const;
const point = (value: number, index: number, count: number, radius = 150) => {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
  return [
    210 + (Math.cos(angle) * radius * value) / 100,
    210 + (Math.sin(angle) * radius * value) / 100,
  ] as const;
};

function Radar({
  report,
  ids,
  showBenchmark = false,
}: {
  report: ReportSnapshot;
  ids: DimensionId[];
  showBenchmark?: boolean;
}) {
  const values = ids.map((id) => report.score.dimensions[id].value ?? 0);
  const benchmarkValues = ids.map(
    (id) => report.organizationBenchmark?.dimensions[id] ?? 0,
  );
  return (
    <svg
      className="radar"
      viewBox="-45 -20 510 460"
      role="img"
      aria-label={`${ids.length}维蛛网图`}
    >
      {[25, 50, 75, 100].map((level) => (
        <polygon
          key={level}
          className="radar-grid"
          points={ids
            .map((_, index) => point(level, index, ids.length).join(","))
            .join(" ")}
        />
      ))}
      {ids.map((id, index) => {
        const [px, py] = point(100, index, ids.length);
        const [lx, ly] = point(100, index, ids.length, 184);
        return (
          <g key={id}>
            <line className="radar-axis" x1="210" y1="210" x2={px} y2={py} />
            <text
              className="radar-label"
              x={lx}
              y={ly}
              textAnchor={lx < 190 ? "end" : lx > 230 ? "start" : "middle"}
            >
              <tspan>{id}</tspan>
              <tspan x={lx} dy="14">
                {DIMENSION_LABELS[id].replace("与", "·")}
              </tspan>
            </text>
          </g>
        );
      })}
      {showBenchmark && report.organizationBenchmark && (
        <polygon
          className="radar-benchmark"
          points={benchmarkValues
            .map((value, index) => point(value, index, ids.length).join(","))
            .join(" ")}
        />
      )}
      <polygon
        className="radar-value"
        points={values
          .map((value, index) => point(value, index, ids.length).join(","))
          .join(" ")}
      />
      {values.map((value, index) => {
        const p = point(value, index, ids.length);
        return (
          <circle
            key={ids[index]}
            className="radar-dot"
            cx={p[0]}
            cy={p[1]}
            r="5"
          >
            <title>
              {ids[index]} {value.toFixed(1)}分
            </title>
          </circle>
        );
      })}
    </svg>
  );
}

function Metric({
  label,
  metric,
  narrative,
}: {
  label: string;
  metric: MetricValue;
  narrative?: ReportMetricNarrative;
}) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{metric.value === null ? "—" : metric.value.toFixed(1)}</strong>
      {narrative ? (
        <>
          <b className={`metric-level metric-level-${narrative.levelId ?? "none"}`}>
            {narrative.levelLabel}
          </b>
          <p>{narrative.description}</p>
        </>
      ) : (
        <small>
          {metric.status === "scored"
            ? "本次有效得分"
            : metric.status === "not_applicable"
              ? "本题目包不适用"
              : "有效数据不足"}
        </small>
      )}
    </article>
  );
}

export function ReportView({ report }: { report: ReportSnapshot }) {
  const personal = [
    "immediate_personal",
    "second_stage_personal",
    "personal_scoped",
    "personal_observer",
  ].includes(report.reportType);
  const organizationalReadinessLabel =
    report.metricNarratives?.find(
      (entry) => entry.metricId === "organizationalAiReadiness",
    )?.label ?? "组织 AI 准备度";
  const ids =
    report.reportType === "personal_scoped"
      ? personalIds
      : organizationOnlyTypes.includes(
            report.reportType,
          )
        ? organizationIds
        : combinedIds;
  const metrics =
    report.reportType === "personal_scoped"
      ? [
          ["employeeAiCapability", "员工 AI 能力", report.score.employeeAiCapability] as const,
          ["realizedAiImpact", "已实现 AI 影响", report.score.realizedAiImpact] as const,
        ]
      : organizationOnlyTypes.includes(
            report.reportType,
          )
        ? [["organizationalAiReadiness", organizationalReadinessLabel, report.score.organizationalAiReadiness] as const]
        : [
            ["employeeAiCapability", "员工 AI 能力", report.score.employeeAiCapability] as const,
            ["organizationalAiReadiness", organizationalReadinessLabel, report.score.organizationalAiReadiness] as const,
            ["realizedAiImpact", "已实现 AI 影响", report.score.realizedAiImpact] as const,
          ];
  const benchmarkMetrics = report.organizationBenchmark
    ? [
        [
          "员工 AI 能力",
          report.score.employeeAiCapability.value,
          report.organizationBenchmark.metrics.employeeAiCapability,
        ],
        [
          "组织 AI 准备度",
          report.score.organizationalAiReadiness.value,
          report.organizationBenchmark.metrics.organizationalAiReadiness,
        ],
        [
          "已实现 AI 影响",
          report.score.realizedAiImpact.value,
          report.organizationBenchmark.metrics.realizedAiImpact,
        ],
      ].filter((entry) => entry[1] !== null || entry[2] !== null)
    : [];
  const classificationSection =
    3 +
    (report.organizationBenchmark ? 1 : 0) +
    (report.retestComparison ? 1 : 0);
  const systemSection =
    classificationSection + (report.score.classificationId ? 1 : 0);
  const departmentPoints = personal || report.reportType === "employee_organization_summary"
    ? []
    : (report.organizationBenchmark?.departments ?? []).filter(
        (department) =>
          department.employeeAiCapability !== null &&
          department.organizationalAiReadiness !== null,
      );
  const diagnoses = report.diagnoses ?? [];
  const behaviorEvidence = report.behaviorEvidence ?? [];
  const personalStrengths = report.strengths.filter((entry) => entry.dimensionId.startsWith("A"));
  const organizationStrengths = report.strengths.filter((entry) => entry.dimensionId.startsWith("B"));
  const pathway = report.developmentPathway;
  const personalPathway = pathway?.filter((step) =>
    step.dimensionIds.some((id) => id.startsWith("A")),
  );
  const organizationPathway = pathway?.filter((step) =>
    step.dimensionIds.some((id) => id.startsWith("B")),
  );
  const personalActions = report.recommendations.filter((entry) =>
    entry.dimensionId.startsWith("A"),
  );
  const organizationActions = report.recommendations.filter((entry) =>
    entry.dimensionId.startsWith("B"),
  );
  const actionGroups = personal
    ? [
        ...(personalPathway?.length || personalActions.length
          ? [{ id: "personal", title: "你的个人提升计划", lede: "先把改变放进你每天真实会做的任务里。", pathway: personalPathway ?? [], actions: personalActions }]
          : []),
        ...(organizationPathway?.length || organizationActions.length ||
          (report.reportType === "personal_observer" && report.observerOrganizationNoActionReason)
          ? [{
              id: "organization",
              title:
                report.reportType === "personal_observer"
                  ? "可以带回团队讨论的改进方向"
                  : "你所在团队可以改善什么",
              lede:
                report.reportType === "personal_observer"
                  ? "这些建议来自你的个人观察，适合带回团队讨论和核实，不代表公司已经形成统一结论。"
                  : "这些事情需要经理、团队或组织提供条件，不应只由员工个人承担。",
              pathway: organizationPathway ?? [],
              actions: organizationActions,
            }]
          : []),
      ]
    : [{ id: "organization", title: "组织变革计划", lede: "从最影响当前进展的环节开始，把方向、管理、治理和学习机制连起来。", pathway: pathway ?? [], actions: report.recommendations }];
  const directionalGroupReport =
    !personal &&
    report.evidenceBasis !== "single_manager_self_assessment" &&
    report.sampleSize < 30;
  return (
    <article
      className={`report ${personal ? "report-personal" : "report-organization"}`}
      id="print-report"
      data-report-ready="true"
      data-report-type={report.reportType}
      data-snapshot-id={report.id}
      data-created-at={report.createdAt}
    >
      <div className="report-watermark" aria-hidden="true">
        {report.tenantId === "tenant-personal" ? "仅供个人发展参考" : "内部资料 · 仅限授权使用"} · 快照 {report.id.slice(0, 8)} · 表达版本{" "}
        {report.versions.expressionVersion}
      </div>
      <header className="report-cover">
        <div className="cover-symbol">
          <span>AI</span>
          <i />
        </div>
        <p className="eyebrow">
          {personal ? "PERSONAL DIAGNOSTIC" : "ORGANIZATION DIAGNOSTIC"}
        </p>
        <h1>
          {report.reportType === "personal_observer"
            ? "你的 AI 准备度与组织环境观察报告"
            : personal
            ? "你的 AI 组织转型诊断报告"
            : `${report.subjectLabel} AI 组织转型诊断报告`}
        </h1>
        <p className="cover-lede">{report.headline}</p>
        <dl>
          <div>
            <dt>报告状态</dt>
            <dd>{report.status === "published" ? "已发布" : "待审核"}</dd>
          </div>
          <div>
            <dt>报告基础</dt>
            <dd>
              {report.evidenceBasis === "single_manager_self_assessment"
                ? "1名指定管理者自评"
                : personal
                  ? "本人作答"
                  : `有效样本 n=${report.sampleSize}`}
            </dd>
          </div>
          <div>
            <dt>报告快照</dt>
            <dd>{report.id.slice(0, 8)}</dd>
          </div>
        </dl>
        <p className="disclaimer">
          {report.evidenceBoundary ??
            "本报告用于学习、组织发展和行动规划，不是绩效评价、能力认证、人员筛选或合规审计工具。"}
        </p>
        {directionalGroupReport && (
          <p className="disclaimer directional-sample-warning">
            本报告仅基于 {report.sampleSize} 份有效作答，属于方向性结果。极小或小样本容易受个别作答影响，不得用于识别个人、部门排名或任何人员评价。
          </p>
        )}
      </header>
      <section className="report-section">
        <div className="section-title">
          <span>01 / 结果总览</span>
          <h2>{report.headline}</h2>
          <p>{report.overview}</p>
        </div>
        <div className={`metrics metrics-${metrics.length}`}>
          {metrics.map(([metricId, label, metric]) => (
            <Metric
              key={metricId}
              label={
                report.metricNarratives?.find((entry) => entry.metricId === metricId)
                  ?.label ?? label
              }
              metric={metric}
              narrative={report.metricNarratives?.find(
                (entry) => entry.metricId === metricId,
              )}
            />
          ))}
        </div>
        <div className="result-narrative">
          <b>整体表现解读</b>
          <p>{report.resultNarrative}</p>
        </div>
      </section>
      <section className="report-section tinted">
        <div className="section-title">
          <span>02 / {ids.length}维画像</span>
          <h2>这不是一个总分，而是一张行动地图。</h2>
          <p>蛛网图用于观察本次各维度的相对高低，不代表行业排名或客观能力。</p>
        </div>
        <div className="profile-grid">
          <figure>
            <Radar
              report={report}
              ids={ids}
              showBenchmark={report.reportType === "second_stage_personal"}
            />
            <figcaption>{ids.length}维整体画像</figcaption>
          </figure>
          <div className="insights">
            <div>
              <span>{personal ? "个人能力优势" : "员工实践优势"}</span>
              {personalStrengths.length ? personalStrengths.map((entry) => (
                <article key={entry.dimensionId}>
                  <b>
                    {entry.dimensionId} · {entry.label}
                  </b>
                  <strong>{entry.score.toFixed(1)}</strong>
                  <p>{entry.summary}</p>
                  {entry.itemSignal && <small>{entry.itemSignal}</small>}
                </article>
              )) : <p className="insight-empty">目前没有需要单独强调的稳定个人能力优势，请结合下方整体画像理解当前状态。</p>}
            </div>
            {ids.some((id) => id.startsWith("B")) && (
              <div>
                <span>{report.reportType === "personal_observer" ? "观察到的组织支持" : "组织支持优势"}</span>
                {organizationStrengths.length ? organizationStrengths.map((entry) => (
                  <article key={entry.dimensionId}>
                    <b>{entry.dimensionId} · {entry.label}</b>
                    <strong>{entry.score.toFixed(1)}</strong>
                    <p>{entry.summary}</p>
                    {entry.itemSignal && <small>{entry.itemSignal}</small>}
                  </article>
                )) : <p className="insight-empty">当前没有需要单独强调的组织支持优势。</p>}
              </div>
            )}
            <div>
              <span>优先发展</span>
              {report.developmentAreas.length ? report.developmentAreas.map((entry) => (
                <article key={entry.dimensionId}>
                  <b>
                    {entry.dimensionId} · {entry.label}
                  </b>
                  <strong>{entry.score.toFixed(1)}</strong>
                  <p>{entry.summary}</p>
                  {entry.itemSignal && <small>{entry.itemSignal}</small>}
                </article>
              )) : <p className="insight-empty">当前没有单一、明显的薄弱维度，更适合结合真实任务整体改善。</p>}
            </div>
          </div>
        </div>
        <div className="profile-narrative">
          <span>结合{ids.length}个维度来看</span>
          {report.profileNarrative && <h3>{report.profileNarrative.headline}</h3>}
          {report.profileNarrative?.paragraphs.map((paragraph) => (
            <article key={paragraph.kind}>
              <b>{profileBlockLabels[paragraph.kind]}</b>
              <p>{paragraph.text}</p>
            </article>
          )) ?? report.overallProfile.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {report.profileNarrative?.boundaryNotice && (
            <aside className="profile-boundary">
              <b>如何理解这份结果</b>
              <p>{report.profileNarrative.boundaryNotice.text}</p>
            </aside>
          )}
        </div>
        {behaviorEvidence.length > 0 ? (
          <div className="diagnosis-grid behavior-evidence-grid">
            {behaviorEvidence.map((evidence) => (
              <article key={evidence.dimensionId}>
                <header>
                  <b>
                    {evidence.dimensionId} · {DIMENSION_LABELS[evidence.dimensionId]}
                  </b>
                  <strong>{evidence.score?.toFixed(1) ?? "数据不足"}</strong>
                </header>
                <p>{evidence.overallMeaning}</p>
                <p className="behavior-detail">
                  <b>具体表现</b>
                  {evidence.concreteBehavior}
                </p>
                <p className="behavior-impact">
                  <b>为什么重要</b>
                  {evidence.impactOrRisk}
                </p>
              </article>
            ))}
          </div>
        ) : diagnoses.length > 0 && (
          <div className="diagnosis-grid">
            {diagnoses.map((diagnosis) => (
                <article key={diagnosis.dimensionId}>
                  <header>
                    <b>
                      {diagnosis.dimensionId} · {DIMENSION_LABELS[diagnosis.dimensionId]}
                    </b>
                    <strong>
                      {report.score.dimensions[diagnosis.dimensionId].value?.toFixed(1) ?? "数据不足"}
                    </strong>
                  </header>
                  {diagnosis.visibleText
                    .filter((text) => text !== diagnosis.boundaryText)
                    .map((text) => <p key={text}>{text}</p>)}
                  {diagnosis.statusId === "BD-O-DIRECTIONAL" && (
                    <small>方向性结果：样本达到2人展示门槛但未达到30人标准门槛，不得用于个人识别、排名或人员评价。</small>
                  )}
                </article>
              ))}
          </div>
        )}
        <details>
          <summary>查看{ids.length}维完整数据</summary>
          <div className="dimension-table">
            {ids.map((id) => (
              <div key={id}>
                <span>
                  {id} · {DIMENSION_LABELS[id]}
                </span>
                <strong>
                  {report.score.dimensions[id].value?.toFixed(1) ?? "数据不足"}
                </strong>
              </div>
            ))}
          </div>
        </details>
      </section>
      {report.organizationBenchmark && (
        <section className="report-section benchmark-section">
          <div className="section-title">
            <span>03 / 组织参照</span>
            <h2>
              {report.reportType === "second_stage_personal"
                ? "把自己的结果放回组织背景。"
                : "同时看均值、中位数和群体分布。"}
            </h2>
            <p>
              本次参照样本 n={report.organizationBenchmark.sampleSize}，
              {report.organizationBenchmark.sampleStatus === "standard"
                ? "满足标准报告门槛"
                : "仅作方向性参照"}
              。方向性参照不得用于个人识别、排名或人员评价。
            </p>
          </div>
          <div className="benchmark-table">
            <header>
              <span>结果</span>
              <span>
                {report.reportType === "second_stage_personal"
                  ? "你的分数"
                  : "组织均值"}
              </span>
              <span>组织中位数</span>
            </header>
            {benchmarkMetrics.map(([label, own, organizationMedian]) => (
              <div key={String(label)}>
                <span>{label}</span>
                <strong>
                  {typeof own === "number" ? own.toFixed(1) : "—"}
                </strong>
                <strong>
                  {typeof organizationMedian === "number"
                    ? organizationMedian.toFixed(1)
                    : "—"}
                </strong>
              </div>
            ))}
          </div>
          {!personal &&
            Object.keys(report.organizationBenchmark.classificationDistribution)
              .length > 0 && (
              <div className="classification-distribution">
                <b>五类定位分布</b>
                <div>
                  {Object.entries(
                    report.organizationBenchmark.classificationDistribution,
                  ).map(([id, value]) => (
                    <span key={id}>
                      {
                        classificationLabels[
                          id as keyof typeof classificationLabels
                        ]
                      }
                      <strong>{value?.percentage.toFixed(1)}%</strong>
                      <small>{value?.count}人</small>
                    </span>
                  ))}
                </div>
                <p>
                  分布用于判断组织内部是否存在不同的行动起点，不用于给员工或部门排名。
                </p>
              </div>
            )}
        </section>
      )}
      {report.retestComparison && (
        <section className="report-section retest-section">
          <div className="section-title">
            <span>
              {report.organizationBenchmark ? "04" : "03"} / 复测对比
            </span>
            <h2>这次与基线相比发生了什么变化。</h2>
            <p>
              基线样本 n={report.retestComparison.baselineSampleSize}，本次样本
              n={report.retestComparison.currentSampleSize}。
            </p>
          </div>
          <div className="retest-metrics">
            {[
              ["员工 AI 能力", report.retestComparison.metrics.employeeAiCapability],
              [
                "组织 AI 准备度",
                report.retestComparison.metrics.organizationalAiReadiness,
              ],
              ["已实现 AI 影响", report.retestComparison.metrics.realizedAiImpact],
            ].map(([label, delta]) => (
              <article key={String(label)}>
                <span>{label}</span>
                <strong className={Number(delta) > 0 ? "up" : Number(delta) < 0 ? "down" : ""}>
                  {typeof delta === "number"
                    ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`
                    : "—"}
                </strong>
                <small>分（本次减基线）</small>
              </article>
            ))}
          </div>
          <div className="retest-dimensions">
            {Object.entries(report.retestComparison.dimensions)
              .filter((entry) => entry[1] !== null)
              .map(([id, delta]) => (
                <span key={id}>
                  {id}
                  <b>
                    {Number(delta) > 0 ? "+" : ""}
                    {Number(delta).toFixed(1)}
                  </b>
                </span>
              ))}
          </div>
          <p className="retest-caveat">{report.retestComparison.caveat}</p>
        </section>
      )}
      {report.score.classificationId && (
        <section className="report-section classification-section">
          <div className="section-title">
            <span>
              {String(classificationSection).padStart(2, "0")} / 双轴定位
            </span>
            <h2>{classificationLabels[report.score.classificationId]}</h2>
            <p>
              员工 AI 能力与{organizationalReadinessLabel}共同决定本次暂定区域；45／55／70为项目暂定阈值，不是行业常模。
            </p>
          </div>
          <div
            className="quadrant"
            data-x-axis-label="员工 AI 能力 →"
            data-y-axis-label={`${organizationalReadinessLabel} ↑`}
          >
            {[45, 55, 70].map((threshold) => (
              <div key={`x-${threshold}`} className="threshold-line threshold-x" style={{ left: `${threshold}%` }}>
                <span>{threshold}</span>
              </div>
            ))}
            {[45, 55, 70].map((threshold) => (
              <div key={`y-${threshold}`} className="threshold-line threshold-y" style={{ bottom: `${threshold}%` }}>
                <span>{threshold}</span>
              </div>
            ))}
            <svg
              className="emergent-zone"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polygon points="45,100 70,100 70,45 100,45 100,30 70,30 70,0 55,0 55,30 0,30 0,55 45,55" />
            </svg>
            <div className="emergent-zone-label">
              <b>涌现区</b>
              <span>由45／55／70阈值形成的过渡区域</span>
            </div>
            <i
              className={`main-point ${(report.score.employeeAiCapability.value ?? 0) >= 85 ? "label-left" : ""}`}
              style={{
                left: `${report.score.employeeAiCapability.value}%`,
                bottom: `${report.score.organizationalAiReadiness.value}%`,
              }}
            >
              <span>{personal ? "你的点位" : "组织整体"}</span>
            </i>
            {departmentPoints.map((department) => (
              <i
                className={`department-point ${department.sampleStatus}`}
                key={department.departmentId}
                style={{
                  left: `${department.employeeAiCapability}%`,
                  bottom: `${department.organizationalAiReadiness}%`,
                }}
              >
                <span>
                  {department.label} · n={department.sampleSize}
                </span>
              </i>
            ))}
            <b className="q1">组织待激活</b>
            <b className="q2">前沿</b>
            <b className="q3">停滞</b>
            <b className="q4">能力受阻</b>
          </div>
          {report.classificationNarrative && (
            <div className="classification-narrative">
              <b>这个位置意味着什么</b>
              <p>{report.classificationNarrative}</p>
            </div>
          )}
          {departmentPoints.length > 0 && (
            <div className="department-position-table">
              <header>
                <span>部门</span>
                <span>员工 AI 能力</span>
                <span>组织 AI 准备度</span>
                <span>样本状态</span>
              </header>
              {departmentPoints.map((department) => (
                <div key={department.departmentId}>
                  <b>{department.label}</b>
                  <strong>
                    {department.employeeAiCapability?.toFixed(1)}
                  </strong>
                  <strong>
                    {department.organizationalAiReadiness?.toFixed(1)}
                  </strong>
                  <small>
                    n={department.sampleSize} ·
                    {department.sampleStatus === "standard"
                      ? "标准展示"
                      : "方向性参考"}
                  </small>
                </div>
              ))}
              <p>
                仅展示达到样本保护门槛的部门；未展示不代表该部门没有数据。
              </p>
            </div>
          )}
        </section>
      )}
      <section className="report-section tinted action-plan-section">
        <div className="section-title">
          <span>{String(systemSection).padStart(2, "0")} / 下一步行动计划</span>
          <h2>
            {personal ? "知道差距以后，接下来具体做什么。" : "把诊断结果变成一组能启动、能跟进的改变。"}
          </h2>
          <p>优先行动只保留当前最需要启动的事项；完整发展地图默认折叠，供后续按依赖顺序查看。</p>
        </div>
        {actionGroups.map((group) => (
          <div className={`action-audience action-audience-${group.id}`} key={group.id}>
            <header><span>{group.id === "personal" ? "PERSONAL" : "ORGANIZATION"}</span><h3>{group.title}</h3><p>{group.lede}</p></header>
            <div className="priority-summary">
              <strong>{group.actions.length}</strong>
              <div>
                <b>当前为什么先做这些</b>
                <p>
                  {report.storyline?.nextStageTheme ?? (group.actions.length
                    ? `当前先从${group.actions.map((entry) => DIMENSION_LABELS[entry.dimensionId]).join("、")}相关行动开始。`
                    : "当前没有足够信息筛选优先行动，请先补齐有效数据。")}
                </p>
              </div>
            </div>
            {group.id === "organization" && group.actions.length === 0 && report.observerOrganizationNoActionReason && (
              <div className="no-action-reason">
                <span>本次为 0 项</span>
                <h3>{report.observerOrganizationNoActionReason.title}</h3>
                <p>{report.observerOrganizationNoActionReason.explanation}</p>
                <b>接下来继续观察什么</b>
                <p>{report.observerOrganizationNoActionReason.watchFor}</p>
              </div>
            )}
            {group.actions.length > 0 && (
              <>
                <div className="priority-heading"><span>PRIORITY ACTIONS</span><h3>当前优先行动</h3></div>
                <div className="priorities">
                  {group.actions.map((action, actionIndex) => (
                    <article key={action.id}>
                      <strong>{group.id === "personal" ? `P${actionIndex + 1}` : `O${actionIndex + 1}`}</strong>
                      <div>
                        <div className="priority-meta">
                          <span>{group.id === "personal" ? "个人行动" : report.reportType === "personal_observer" ? "需团队核实" : "组织行动"}</span>
                          <span>{actionModeLabels[action.actionMode ?? "validate"]}</span>
                          <span>{DIMENSION_LABELS[action.dimensionId]} · {report.score.dimensions[action.dimensionId].value?.toFixed(1) ?? "数据不足"}分</span>
                          <span>建议周期 {action.suggestedWindow}</span>
                        </div>
                        <h3>{action.title}</h3>
                        <div className="priority-reason"><b>为什么现在做</b><p>{action.selectionReason ?? action.rationale}</p></div>
                        <div className="priority-action"><b>具体动作</b><p>{action.action}</p></div>
                        <div className="priority-completion"><b>完成标准</b><p>{action.successSignal}</p></div>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
            <details className="development-map">
              <summary>查看后续完整发展地图（{group.pathway.length}个维度）</summary>
              <div className="system-map">
                {group.pathway.map((step, index) => (
                  <article className={`pathway-card pathway-${step.mode}`} key={step.id}>
                    <div className="pathway-card-topline"><span>{String(index + 1).padStart(2, "0")}</span><em>{pathwayModeLabels[step.mode]}</em></div>
                    <small className="pathway-dimensions">{step.dimensionIds.map((id) => DIMENSION_LABELS[id]).join(" · ")} · 当前分数{step.dimensionIds.map((id) => report.score.dimensions[id].value).filter((value): value is number => value !== null).map((value) => ` ${value.toFixed(1)}`).join(" / ") || " 数据不足"}</small>
                    <h3>{step.title}</h3><p>{step.description}</p><small className="pathway-outcome">做到什么算有进展：{step.outcome}</small>
                  </article>
                ))}
              </div>
            </details>
          </div>
        ))}
      </section>
      <section className="report-section method">
        <div className="section-title">
          <span>{String(systemSection + 1).padStart(2, "0")} / 方法边界</span>
          <h2>如何理解这份报告</h2>
        </div>
        <p>
          1—5分转换为0—100分；无法判断不计分。报告基于公开构念的二次开发，目前仍处于内部试点和心理测量验证阶段。
        </p>
        <p>{report.evidenceBoundary}</p>
        <p>
          报告正文由固定版本的诊断与建议库确定性生成，相同输入与版本产生相同内容。
        </p>
        {report.evidenceReferences?.length > 0 && (
          <div className="evidence-list">
            <h3>本报告实际引用的证据来源</h3>
            {report.evidenceReferences.map((evidence) => (
              <article key={evidence.id}>
                <a href={evidence.url} target="_blank" rel="noreferrer">
                  {evidence.title}
                </a>
                <p>{evidence.supports}</p>
                <small>使用边界：{evidence.boundary}</small>
              </article>
            ))}
          </div>
        )}
      </section>
      <footer>
        <span>AI 组织转型诊断</span>
        <span>
          快照 {report.id} · 表达版本 {report.versions.expressionVersion}
        </span>
      </footer>
    </article>
  );
}
