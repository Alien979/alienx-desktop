use app_lib::sigma_accel::{build_synthetic_sigma_data, run_sigma_prefilter};

fn main() {
    let event_count = 120_000;
    let rule_count = 700;

    let (events, rules) = build_synthetic_sigma_data(event_count, rule_count);

    let result = run_sigma_prefilter(&events, &rules, 0, None);

    println!(
        "native_sigma_prefilter events={} rules={} totalComparisons={} candidates={} quickRejects={} timeMs={:.2}",
        event_count,
        rule_count,
        result.stats.total_comparisons,
        result.stats.candidate_comparisons,
        result.stats.quick_rejects,
        result.stats.processing_time_ms
    );
}
