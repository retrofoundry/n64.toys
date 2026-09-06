use n64_toys_asm::{analyze, assemble_at, assemble_at_with_textures, Diag, TextureInput};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, path::PathBuf};

const SCENES: [&str; 34] = [
    "alpha-threshold",
    "backface-culling",
    "chrome-icosphere",
    "ci4-canary",
    "ci4-grid",
    "ci8-canary",
    "ci8-ramp",
    "decal",
    "fill-texrect",
    "flat-color",
    "fogworld",
    "framebuffer-extent",
    "high-poly",
    "hud-over-3d",
    "i4-ramp",
    "i8-ramp",
    "ia16-ramp",
    "ia4-ramp",
    "ia8-ramp",
    "lights",
    "matrix-stack",
    "mirror-repeat",
    "morphcube",
    "multi-material",
    "offscreen-then-sample",
    "onetri",
    "perspective-cube",
    "segmented-sub-dl",
    "texrectflip",
    "textured-quad",
    "tron",
    "two-cycle-combiner",
    "wrap-repeat",
    "starter",
];
const TIME_BITS: [u32; 7] = [
    0x00000000, 0x3c888889, 0x3faf5c29, 0x3fc90fdb, 0x40000000, 0x40490fdb, 0xbe800000,
];
const PROFILES: [&str; 3] = ["legacy-white32", "named-white", "named-patterned"];
const PALETTE: [[u8; 4]; 8] = [
    [0, 0, 0, 0],
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 255, 255, 255],
    [128, 64, 32, 128],
    [32, 128, 224, 0],
    [200, 100, 50, 255],
];

#[derive(Clone, Deserialize, Serialize)]
struct FrozenTexture {
    name: String,
    width: u32,
    height: u32,
}

#[derive(Deserialize, Serialize)]
struct Case {
    input_textures: Vec<FrozenTexture>,
    #[serde(flatten)]
    output: Value,
}

type Corpus = BTreeMap<String, Case>;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn diagnostics(diags: &[Diag]) -> Value {
    json!(diags
        .iter()
        .map(|diag| json!({ "line": diag.line, "msg": diag.msg }))
        .collect::<Vec<_>>())
}

fn record(source: &str, time_bits: u32, profile: &str, textures: &[FrozenTexture]) -> Value {
    let time = f32::from_bits(time_bits);
    let result = if profile == "legacy-white32" {
        assemble_at(source, time, Some((&vec![255; 32 * 32 * 4], 32, 32)))
    } else {
        let pixels: Vec<Vec<u8>> = textures
            .iter()
            .enumerate()
            .map(|(ordinal, texture)| {
                let mut rgba8 = Vec::with_capacity((texture.width * texture.height * 4) as usize);
                for y in 0..texture.height {
                    for x in 0..texture.width {
                        let texel = if profile == "named-white" {
                            [255; 4]
                        } else {
                            PALETTE[(x as usize + 3 * y as usize + 5 * ordinal) % 8]
                        };
                        rgba8.extend_from_slice(&texel);
                    }
                }
                rgba8
            })
            .collect();
        let inputs: Vec<_> = textures
            .iter()
            .zip(&pixels)
            .map(|(texture, rgba8)| TextureInput {
                name: &texture.name,
                rgba8,
                width: texture.width,
                height: texture.height,
            })
            .collect();
        assemble_at_with_textures(source, time, &inputs)
    };
    match result {
        Ok(image) => {
            let mut source_map = Sha256::new();
            source_map.update((image.source_map.len() as u64).to_be_bytes());
            for (addr, line) in &image.source_map {
                source_map.update(addr.to_be_bytes());
                source_map.update((*line as u64).to_be_bytes());
            }
            let analysis = analyze(source);
            json!({
                "ok": true,
                "rdram_sha256": format!("{:x}", Sha256::digest(&image.rdram)),
                "rdram_len": image.rdram.len(),
                "entry_addr": image.entry_addr,
                "vtx_addr": image.vtx_addr,
                "vp_addr": image.vp_addr,
                "tex_addr": image.tex_addr,
                "light_addr": image.light_addr,
                "lookat_addr": image.lookat_addr,
                "source_map_sha256": format!("{:x}", source_map.finalize()),
                "analysis": {
                    "textures": analysis.textures.iter().map(|texture| json!({
                        "name": texture.name,
                        "width": texture.width,
                        "height": texture.height,
                        "format": texture.format,
                        "line": texture.line,
                    })).collect::<Vec<_>>(),
                    "references_time": analysis.references_time,
                    "diagnostics": diagnostics(&analysis.diagnostics),
                },
            })
        }
        Err(diags) => json!({ "ok": false, "diagnostics": diagnostics(&diags) }),
    }
}

fn build_corpus(expected: Option<&Corpus>) -> Corpus {
    let mut corpus = Corpus::new();
    for scene in SCENES {
        let path = if scene == "starter" {
            root().join("web-app/src/lib/docs/starter.n64")
        } else {
            root().join(format!("crates/asm/tests/scenes/{scene}.n64"))
        };
        let source = fs::read_to_string(&path).unwrap_or_else(|error| panic!("{path:?}: {error}"));
        let declared: Vec<_> = if expected.is_none() {
            analyze(&source)
                .textures
                .into_iter()
                .map(|texture| FrozenTexture {
                    name: texture.name,
                    width: texture.width,
                    height: texture.height,
                })
                .collect()
        } else {
            Vec::new()
        };
        for time_bits in TIME_BITS {
            for profile in PROFILES {
                let key = format!("{scene}|{time_bits:08x}|{profile}");
                let textures = match expected {
                    Some(expected) => {
                        &expected
                            .get(&key)
                            .unwrap_or_else(|| {
                                panic!("case {key}, field case: missing expected case")
                            })
                            .input_textures
                    }
                    None => &declared,
                };
                corpus.insert(
                    key,
                    Case {
                        input_textures: textures.clone(),
                        output: record(&source, time_bits, profile, textures),
                    },
                );
            }
        }
    }
    corpus
}

fn first_difference(expected: &Value, actual: &Value, field: &str) -> Option<String> {
    match (expected, actual) {
        (Value::Object(expected), Value::Object(actual)) => {
            for key in expected.keys().chain(actual.keys()) {
                let path = if field.is_empty() {
                    key.clone()
                } else {
                    format!("{field}.{key}")
                };
                match (expected.get(key), actual.get(key)) {
                    (Some(expected), Some(actual)) => {
                        if let Some(difference) = first_difference(expected, actual, &path) {
                            return Some(difference);
                        }
                    }
                    (expected, actual) => {
                        return Some(format!("{path}: expected {expected:?}, actual {actual:?}"));
                    }
                }
            }
            None
        }
        (Value::Array(expected), Value::Array(actual)) => {
            if expected.len() != actual.len() {
                return Some(format!(
                    "{field}.len: expected {}, actual {}",
                    expected.len(),
                    actual.len()
                ));
            }
            expected
                .iter()
                .zip(actual)
                .enumerate()
                .find_map(|(index, (expected, actual))| {
                    first_difference(expected, actual, &format!("{field}[{index}]"))
                })
        }
        _ if expected == actual => None,
        _ => Some(format!("{field}: expected {expected}, actual {actual}")),
    }
}

fn assert_primary_successes(corpus: &Corpus) {
    assert_eq!(corpus.len(), 714);
    let errors: Vec<_> = corpus
        .iter()
        .filter(|(_, case)| case.output["ok"] != true)
        .map(|(key, case)| format!("{key}: {}", case.output))
        .collect();
    assert!(
        errors.is_empty(),
        "primary cases failed:\n{}",
        errors.join("\n")
    );
    println!(
        "corpus: {} cases, {} ok, 0 errors",
        corpus.len(),
        corpus.len()
    );
}

#[test]
fn compatibility_corpus() {
    let expected: Corpus = serde_json::from_str(
        &fs::read_to_string(root().join("crates/asm/tests/compat/expected.json")).unwrap(),
    )
    .unwrap();
    let actual = build_corpus(Some(&expected));
    for (key, case) in &actual {
        if let Some(difference) = first_difference(
            &serde_json::to_value(&expected[key]).unwrap(),
            &serde_json::to_value(case).unwrap(),
            "",
        ) {
            panic!("case {key}, field {difference}");
        }
    }
    for key in expected.keys() {
        assert!(
            actual.contains_key(key),
            "case {key}, field case: unexpected expected case"
        );
    }
    assert_primary_successes(&actual);
}

#[test]
#[ignore]
fn write_expected_candidate() {
    let corpus = build_corpus(None);
    let directory = root().join("crates/asm/tests/compat");
    fs::create_dir_all(&directory).unwrap();
    fs::write(
        directory.join("expected.candidate.json"),
        format!("{}\n", serde_json::to_string_pretty(&corpus).unwrap()),
    )
    .unwrap();
    assert_primary_successes(&corpus);
}
