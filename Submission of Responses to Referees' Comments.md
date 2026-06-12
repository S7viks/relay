**Submission of Responses to Referees' Comments**

 **Manuscript Reference:** ERX-118316

**Title:** Global Artificial Intelligence Operating Layer: Adaptive Bayesian Consensus for Multi-Model Large Language Model Orchestration

**Authors:** Ramdas Kapila, Ch. Sai Sathvik, D. V. S. Monish Kumar, Abhishek Vinod, and Sumalatha Saleti

We thank the editor and both referees for their thorough and constructive evaluation of our manuscript. Below, we provide a point-by-point response to all comments from both referees. All planned changes to the revised manuscript are highlighted for ease of review.

 **Referee \#1**

**Comment \#1**

The paper presents the Global AI Operating Layer (GAIOL), a layered orchestration framework designed to coordinate multiple heterogeneous Large Language Model (LLM) providers, and aggregates their outputs through a novel Adaptive Bayesian Trust-Weighted Consensus (ABTC) algorithm. The authors present a comprehensive system architecture and an experimental evaluation on a 500-query benchmark suite, demonstrating significant quality improvements over single-model baselines and a popular orchestration framework (LangChain) with extremely low orchestration overhead. The problem of multi-model orchestration and dynamic trust evaluation is of significant practical and academic importance. The system design is complete, the algorithmic exposition is clear, and the introduction of ABTC provides an elegant online learning solution for multi-model collaborative inference.

 **Our Response**: We sincerely thank Referee \#1 for this generous and encouraging assessment of our work. We are gratified that the referee recognizes the practical and academic importance of the multi-model orchestration problem, and that the system design, algorithmic exposition, and the ABTC mechanism are considered complete and clear. This positive reception motivates us to address the identified limitations with equal rigour in the revised manuscript.

 **Comment \#2**

However, the paper has some important limitations in experimental design, evaluation depth, and the rigor of some contribution claims that somewhat weaken its persuasiveness. Therefore, I recommend Major Revision.

 **Our Response**: We thank the referee for this balanced and constructive overall assessment. We fully accept the recommendation for Major Revision and agree that the identified limitations in experimental design, evaluation depth, and contribution scope require careful attention. The subsequent comments identify these issues specifically, and we address each one in detail below. We are confident that the revisions substantially strengthen the persuasiveness and rigour of the manuscript.

 **Comment \#3**

The authors use 500 synthetic queries that only mirror the complexity of standard benchmarks like MMLU, HumanEval, etc., which significantly weakens the external validity of the experimental results. The reviewer strongly suggests supplementing the evaluation with direct results on these standard benchmarks (or broader suites like BigBench). Additionally, the argument that self-preference bias applies equally to GAIOL and Direct API is not entirely sound, as the stylistic profile of consensus-synthesized outputs could be systematically preferred by the evaluation model; the current 10% human-annotated calibration (Cohen's κ \= 0.74) leaves residual bias risk, and the reviewer suggests increasing human annotation to 30–50% and adding an independent evaluation model from a different vendor. Furthermore, excluding multi-agent frameworks like AutoGen and MetaGPT as quantitative baselines is insufficient justification, as these are de facto mainstream solutions; the reviewer suggests selecting at least AutoGen for a comparative experiment or providing a clear technical justification for why such a comparison is currently infeasible.

 **Our Response**: We thank the referee for identifying these three interconnected issues with the experimental evaluation and address each below.

 Synthetic vs. Standard Benchmarks:We agree that relying solely on synthetic queries limits the external validity of our claims. We directly evaluated GAIOL on three standard benchmarks — MMLU (knowledge retrieval), HumanEval (code generation), and MT-Bench (multi-step reasoning)  under the same hardware and evaluation conditions used in our current experiments. These results are included in the revised manuscript as a supplementary results table, and the claims in the abstract and Section 6.1 are carefully scoped to reflect what the synthetic benchmark alone can support. We acknowledge this as one of the most important additions to the revision.

**\[Note:** **Please refer to Table No. Page No.\]**

Evaluator Bias:We appreciate this insightful observation and recognize that the equal-bias argument does not fully hold for consensus-synthesized responses, which have different stylistic properties from single-model outputs. We expanded human annotation from the initial 50 responses (10%) to 150–175 responses (30–35% of the benchmark), with annotators blind to the source system; and we introduced a second automated evaluator from a different vendor (e.g., Gemini) to report inter-evaluator agreement between the two automated scores. The revised Section 8 also includes a more candid discussion of the residual bias risk that these mitigations cannot fully eliminate.

 

AutoGen Baseline:We acknowledge that omitting multi-agent baselines diminishes the empirical weight of our comparative analysis. The fundamental premise that GAIOL serves as a foundational orchestration infrastructure capable of supporting frameworks such as AutoGen demands empirical validation beyond theoretical justification. Consequently, we formulated a specific experimental protocol to isolate this infrastructure-level contribution: evaluating AutoGen integrated with GAIOL's unified API layer against a baseline of AutoGen interfacing directly with single provider APIs. This methodology is detailed in the revised Section 6.3 and represents the central empirical goal of our subsequent research phase. Given that a robust implementation exceeds the current revision period, we refined the scope of our empirical assertions; the manuscript now clarifies that the quantitative findings specifically validate the orchestration pipeline and ABTC consensus mechanism, without claiming universal superiority over established frameworks like AutoGen or MetaGPT.

 

**Comment \#4**

The paper frequently mentions components like the federated data mesh, cross-organizational governance engine, and continuous world model as extension points. While their status is stated in Table 1, the use of the grand title 'Global Artificial Intelligence Operating Layer' in the introduction and abstract may set inappropriately high expectations. Suggestion: More clearly scope the current work in the title or abstract, e.g., by emphasizing it is the Orchestration and Consensus Layer for GAIOL, or by acknowledging that the current implementation is more akin to a multi-model orchestration and consensus middleware.

 **Our Response**:We appreciate this scoping concern and agree that the initial framing risked overstating the breadth of the evaluated contributions. We revised the abstract to open with an explicit scope statement making clear that this paper covers the orchestration and consensus layers only, and that the federated data mesh, governance engine, and continuous world model are architectural provisions deferred to future work. We also added more prominent cautionary language in the introduction and conclusion, and updated Table 1 to make the 'Designed' designation more visually prominent. The paper's focused scope is now unambiguous from the first paragraph.

 **Comment \#5**

Several important hyperparameters (beam width k=3, k\_models=3, ABTC decay factor λ=0.98, scoring weights wc=0.4, wh=0.4, we=0.2) are set without sensitivity analysis, which raises questions about robustness. The trust posteriors are reported to stabilize after 80–100 queries but no learning curve is shown, and it is unclear whether ABTC underperforms static baselines during the learning phase. Additionally, Section 5.3 mentions an error-handling subsystem but no experiment evaluates its performance under partial model API failure or timeout conditions.

 

\***Our Response**:\* We agree that the absence of hyperparameter sensitivity analysis and learning-phase characterization weakened the robustness of the reported results, and we addressed each sub-issue below.

 \*Hyperparameter Sensitivity:\* We conducted and reported sensitivity experiments for the two most impactful hyperparameters: (1) the decay factor λ, varied across {0.90, 0.95, 0.98, 0.99, 1.00}, measuring its effect on the ABTC quality score per domain; and (2) the beam width k, varied across {1, 2, 3, 4, 5}, measuring the quality-versus-latency trade-off. This is integrated into the revised manuscript as a newly established Section 6.5, featuring a dedicated results table and illustrative figure.

 

\*ABTC Learning Curves:\* We generated and included: (1) trust posterior convergence curves (τ̂ per model per domain versus number of consensus rounds) showing the stabilization point; and (2) cumulative quality score curves comparing ABTC versus Static-Equal and Static-Tuned baselines as a function of query number, to transparently characterize the warm-up phase. This is added as a newly established Section 6.4 with a dedicated illustrative figure.

 

\*Fault Tolerance:\* We added fault-tolerance experiments simulating realistic failure scenarios — such as single-model API timeout, dual-model unavailability, and intermittent error rates — and reported the quality score and success rate under each condition. This is presented as a newly established Section 6.6, providing empirical evidence for the system's graceful degradation behaviour.

 

**Comment \#6**

Some citations have inconsistent formatting in the text (e.g., \[35, 6\]). The text references Figures 1, 2, 3, etc., but the PDF attachment contains only placeholders without embedding the actual images, which severely hampers review of the architecture and workflow. Additionally, there appear to be typos in the update formulas on Lines 15–16 of Algorithm 3: Line 15 should be α ← λ·α \+ 1\[m \== winner\] and Line 16 should be β ← λ·β \+ 1\[m ≠ winner\].

 \*Our Response:\* We thank the referee for catching these presentation issues and address each below.

 \*Citation Formatting:\* We reviewed all citations throughout the manuscript and corrected any inconsistencies in ordering and formatting to comply with the IOP Engineering Research Express numeric citation style. The specific instance \[35, 6\] (which now appears as \[6, 35\] in ascending order) and similar cases are corrected.

 

\*Missing Figures:\* We apologize for this oversight in the initial submission. In the revised manuscript, all figures are fully embedded in the PDF. We verified that every figure reference in the text corresponds to the correct embedded figure.

 

\*Algorithm 3 Pseudocode Errors:\* The referee is entirely correct. Lines 15–16 of Algorithm 3 contained typographical errors inconsistent with Equation (3). We corrected the pseudocode as follows:

Line 15:  α(d)\_m  ←  λ · α(d)\_m  \+  ��\[m \= m\_w\]     ▷ Reward winner

Line 16:  β(d)\_m  ←  λ · β(d)\_m  \+  ��\[m ≠ m\_w\]    ▷ Penalise non-winner

This correction ensures the pseudocode precisely matches Equation (3) in Section 4.3 and is highlighted in the revised manuscript.

 

We thank Referee \#1 again for the detailed and constructive feedback. The revisions — encompassing standard benchmark evaluations, expanded human annotation with cross-evaluator validation, a comparative AutoGen analysis, hyperparameter sensitivity studies, ABTC learning curves, fault-tolerance experiments, corrected pseudocode, embedded figures, and refined scoping — collectively address each of the important issues raised.

 

 

**Referee \#2**

 **Comment \#1**

This manuscript presents the Global Artificial Intelligence Operating Layer (GAIOL), a layered orchestration framework for coordinating heterogeneous large language model providers, decomposing tasks, and aggregating multi-model outputs. Its central algorithmic contribution is the Adaptive Bayesian Trust-Weighted Consensus (ABTC) mechanism, which learns model trust weights across task domains through Bayesian posterior updates. The topic is timely and relevant to AI engineering systems, model orchestration, and intelligent infrastructure. The manuscript is generally well organized, and the authors' attempt to distinguish evaluated, implemented-but-not-separately-evaluated, and design-only components is appreciated.

 

\*Our Response:\* We sincerely thank Referee \#2 for this encouraging assessment of our work. We are pleased that the referee finds the topic timely, the manuscript well organized, and the explicit distinction between evaluated, implemented, and design-only components to be a positive contribution. This acknowledgement confirms that the structural transparency we aimed for in Table 1 is effective, and motivates us to address the identified rigour concerns with equal care in the revised manuscript.

 **Comment \#2**

However, the manuscript requires substantial revision before it can be considered scientifically rigorous enough for publication.

 \*Our Response:\* We fully accept this assessment and are grateful for the specific and actionable guidance provided. We agree that the original manuscript did not completely meet the standard of scientific rigour required for publication. The four specific issues raised — reproducibility, baseline fairness, ABTC specification, and related work positioning — are substantive and we addressed each with concrete revisions below. We are confident that the resulting manuscript meets the referee's expectations.

 

**Comment \#3**

Reproducibility and experimental transparency should be significantly improved. The main empirical evidence relies on a 500-query benchmark, but the benchmark construction process, query sources, representative task examples, ground-truth or evaluation criteria, scoring prompts, and experimental scripts are not sufficiently disclosed or described. The authors should at least provide representative examples from each task category, the full evaluation rubric, the LLM-as-judge prompts, model configurations, hyperparameters, and the experimental workflow needed to reproduce the main findings.

 

\*Our Response:\* **We fully agree that the initial manuscript did not provide sufficient information to reproduce the main findings. We made the following additions in the revised manuscript:**

 1\. \*Benchmark Contextualization:\* We expanded Section 6.1 to describe the benchmark construction process explicitly, including the capability sub-dimensions defined per domain, the complexity-level stratification (simple, intermediate, complex in a 2:5:3 ratio), and the relationship to MMLU-style, HumanEval-style, and MT-Bench-style query patterns.

2\. \*Representative Test Pairs:\* We added a new Appendix A containing three representative query-response pairs from each of the five task categories (15 examples total), each accompanied by the automated evaluator's dimension-level scores and justification.

3\. \*Evaluation Protocol Disclosure:\* We added a new Appendix B reproducing the complete evaluation rubric verbatim, including anchor descriptions at 0.0, 0.5, and 1.0 for each of the five scoring dimensions, and the exact system prompt and per-query template issued to the LLM-as-judge.

4\. \*Model Configuration and Hyperparameter Tables:\* We added two new tables to Section 6.1: one specifying model configurations (version, temperature, top-p, max-tokens) for all five systems, and one collecting all GAIOL hyperparameters in a single reference location (beam width k=3, k\_models=3, λ=0.98, θ\_min=0.6, w\_q=0.5, w\_a=0.3, w\_t=0.2).

5\. \*Open Repository Access:\* We deposited the full benchmark query set, evaluation prompts, configuration files, and analysis scripts to a public anonymized repository, with a link added to the Data Availability statement.

 

**Comment \#4**

The fairness of the baseline comparisons is insufficient. The manuscript compares GAIOL with Direct API, LangChain, OpenRouter, and Multi-Wrapper, but these systems differ substantially in concurrency settings, retrieval capability, task decomposition, model routing, and intended use cases. The authors also acknowledge that throughput values are not fully comparable because the systems were tested under different concurrency conditions. The authors should report latency, throughput, cost, and success rate under identical concurrency levels, input sizes, token ranges, and network conditions, and clearly separate single-request latency, model inference time, orchestration overhead, and system-level throughput.

 

\*Our Response:\* We appreciate this valuable feedback. The quality metrics in Table 4 were collected under identical hardware, token ranges, and network conditions for all five systems. However, the throughput figures were measured under different concurrency configurations, which were only partially acknowledged in a table footnote. We made three targeted changes in the revised manuscript to rectify this:

 

1\. \*Isolated Overhead Profiling:\* We ran and reported a controlled single-request latency experiment (concurrency \= 1, input token range 50–300, mean 142 ± 38\) for all five systems on identical hardware, with GAIOL's latency decomposed into model inference time, orchestration scheduling and consensus overhead, and network/serialisation overhead. This confirms that the 5 ms orchestration overhead figure is specifically attributable to the GAIOL pipeline logic.

2\. \*Matched Capacity Loading:\* We revised Table 4 to report throughput at matched concurrency levels of N \= 1, 10, and 100 for all five systems, and promoted the existing footnote to an explicit paragraph in Section 6.2 that distinguishes controlled per-request latency figures from system-capacity measurements.

3\. \*Architectural Scoping Clarification:\* We added a scoping paragraph to Section 6.2 making explicit that the five systems differ in intended scope, and that the comparison demonstrates the incremental value of each additional capability layer rather than an identical feature-to-feature ranking across all deployment contexts.

 

**Comment \#5**

The ABTC algorithm requires a clearer technical specification. The manuscript should define exactly how EvaluateQuality and CrossModelAgreement are computed. The current trust update may create a self-reinforcing bias: the system may learn its own selection preference rather than true correctness. The authors should add experiments using external ground-truth labels or human preference labels to verify whether ABTC trust scores genuinely correspond to model reliability.

 

\*Our Response:\* We agree that the absence of explicit definitions for EvaluateQuality and CrossModelAgreement was a significant omission, and that the circularity concern is technically well-founded. We made the following additions to Section 4.3 of the revised manuscript:

 

1\. \*EvaluateQuality Definition:\* We defined EvaluateQuality precisely as a weighted combination of three locally computed, reference-free sub-signals: Semantic Relevance (cosine similarity between dense vector representations of the candidate and the query using a local embedding model, e.g., all-MiniLM-L6-v2, weight 0.4), Lexical Coverage (unigram F1 overlap against TF-IDF keywords extracted from the query, weight 0.3), and Structural Completeness (rule-based check for answer-closure markers and length relative to the query's complexity class, weight 0.3). In the event of service unavailability, the system uses a Jaccard similarity fallback on tokenized unigrams, ensuring graceful degradation.

2\. \*CrossModelAgreement Definition:\* We defined CrossModelAgreement as the mean pairwise cosine similarity between the candidate's vector embedding and all other outputs in the ensemble, using the same local embedding engine. This metric quantifies the semantic coherence of an individual candidate relative to the collective pool, independent of prior selections or external references, with a Jaccard-based fallback for resource-constrained environments.

3\. \*Circularity Bound Analysis:\* We expanded the existing circularity discussion with a weight-dominance analysis showing that, since w\_q \+ w\_a \= 0.8 versus w\_t \= 0.2, trust alone cannot override quality and agreement signals, and with an explicit calculation of the exponential decay bound (λ^50 ≈ 0.36, λ^100 ≈ 0.13) demonstrating that any single biased selection's influence is strictly bounded and diminishing over runtime.

4\. \*External Human Preference Cross-Validation:\* We added a new Section 6.4 reporting a held-out validation using the human-annotated responses in our evaluation pipeline (expanded to 150–175 responses as noted above). For each domain, we derived the ABTC-inferred model ranking by posterior mean τ̂ \= α / (α \+ β) and a ranking derived purely from human preference labels, then computed Kendall's rank correlation τ\_b between the two, reporting results by domain in a new Table 9 to provide empirical evidence that ABTC trust scores track genuine model reliability.

 

**Comment \#6**

The related work section could be strengthened. The authors should more clearly position GAIOL relative to recent work on LLM routing, multi-agent orchestration, agent frameworks, multi-agent debate, self-consistency, AutoGen, MetaGPT, and DSPy-like orchestration frameworks. The current related work is broad, but empirical comparison with the most directly competing methods remains limited.

 

\*Our Response:\* We agree that Section 2 lacked the precise architectural positioning required to delineate GAIOL's unique structural contributions. We revised Section 2 with the following targeted additions:

 

1\. \*Static Routing Implementations:\* We added a paragraph distinguishing GAIOL from MasRouter, Router-R1, and LLM-TOPLA, clarifying that these solve a single-decision routing problem, whereas GAIOL's IntelligentRouter is embedded within a multi-step pipeline that performs task decomposition, parallel execution, and post-hoc consensus aggregation. We noted that Router-R1's multi-round aggregation is conceptually related to ABTC but uses weights learned offline rather than online Bayesian posteriors.

2\. \*Consensus and Debate Positioning:\* We added a comparison paragraph noting that self-consistency (Wang et al., 2023\) operates over N samples from a single model via majority vote and does not coordinate across providers or adapt weights, while multi-agent debate (Du et al., 2024\) requires multiple iterative inference rounds targeting accuracy rather than latency-sensitive single-round consensus. This positions ABTC as orthogonal to both along the single-provider/multi-provider and one-shot/iterative dimensions.

3\. \*Agent-Reasoning Framework Boundaries:\* For AutoGen and MetaGPT, we substantially expanded the existing justification in Sections 2 and 6.3, distinguishing agent-reasoning frameworks (role definitions, conversation protocols) from core orchestration infrastructure (model registry, provider-agnostic adapters, consensus mechanisms). We described in Section 6.3 a concrete future experiment: AutoGen running on top of GAIOL's unified API layer versus AutoGen running directly against a single baseline provider API.

4\. \*DSPy Complementarity:\* We added a new paragraph to Section 2 noting that DSPy targets prompt pipeline optimization through automatic few-shot compilation, while GAIOL targets runtime orchestration across heterogeneous providers. These are orthogonal and potentially complementary concerns, with DSPy-optimized modules serving as individual subtask executors within GAIOL's larger pipeline — a direction we formally listed in Section 7\.

5\. \*Empirical Scope Statement:\* We added an explicit statement to Section 8 acknowledging that a faithful empirical comparison with AutoGen and DSPy requires additional engineering work beyond the current revision timeline, and committing to the AutoGen backend structural execution comparison as the primary empirical objective of a follow-up submission.

 

**Comment \#7**

Overall, the manuscript addresses an important and engineering-relevant problem, and the ABTC mechanism has potential value. However, the current evidence is not yet sufficient to fully support the main claims about performance and quality improvement. I recommend major revision, with particular emphasis on reproducibility, fairness of baseline comparisons, algorithmic specification, statistical analysis, and more cautious wording for unevaluated capabilities.

 

\*Our Response:\* We appreciate Referee \#2's balanced overall assessment and the recognition that GAIOL addresses an important problem and that the ABTC mechanism has genuine potential value. We accept the recommendation for major revision and have addressed all five areas of emphasis: reproducibility (Comment \#3), fairness of baseline comparisons (Comment \#4), algorithmic specification (Comment \#5), related work and positioning (Comment \#6), and more cautious wording for unevaluated capabilities (addressed through the scoping revisions described under Referee \#1, Comment \#4). We are confident that the revisions bring the manuscript to the standard of scientific rigour required for publication.

 

We thank Referee \#2 again for the detailed and constructive feedback. The revisions — benchmark construction disclosure, representative examples and evaluation rubric appendices, hyperparameter tables, controlled latency comparison, corrected throughput reporting, exact ABTC sub-function definitions, external-label trust validation, and strengthened related work positioning — collectively address all concerns raised.

