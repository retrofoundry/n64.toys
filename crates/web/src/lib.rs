//! wasm-bindgen entrypoint: canvas binding + asm -> process_dl -> present wiring.
//!
//! The JS-facing surface is per-item `#[cfg(target_arch = "wasm32")]`-gated so the pure helpers below
//! (`map_diags`/`should_present`) and their tests still build under native `cargo test`.

use fast3d::{Diagnostic, DlSummary};
use serde::{Deserialize, Serialize};

#[cfg(target_arch = "wasm32")]
use fast3d::{
    ClearPolicy, Hardware, Microcode, Rdram, RdramImage, Renderer as Fast3dRenderer, RendererConfig,
};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;
#[cfg(target_arch = "wasm32")]
use web_sys::HtmlCanvasElement;

// Reachable only from the wasm render path + tests (both cfg'd out on native), hence allow(dead_code).
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
#[derive(Serialize)]
struct DiagOut {
    line: usize,
    msg: String,
}

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
#[derive(Serialize)]
struct TextureDeclOut {
    name: String,
    width: u32,
    height: u32,
    format: String,
    line: usize,
}

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
#[derive(Serialize)]
struct TextureDeclarationsOut {
    declarations: Vec<TextureDeclOut>,
    diags: Vec<DiagOut>,
}

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
#[derive(Deserialize)]
struct TextureInputIn {
    name: String,
    rgba: Vec<u8>,
    width: u32,
    height: u32,
}

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
#[derive(Serialize)]
struct RenderOut {
    diags: Vec<DiagOut>,
    is_time_variant: bool,
    /// Non-fatal runtime error (e.g. surface loss), distinct from the HLE diags.
    error: Option<String>,
}

/// Map HLE diagnostics to the JS list. `line` is the command byte address (`Diagnostic::at`), not a
/// source line.
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
fn map_diags(diags: &[Diagnostic]) -> Vec<DiagOut> {
    diags
        .iter()
        .map(|d| DiagOut {
            line: d.at as usize,
            msg: d.kind.to_string(),
        })
        .collect()
}

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
fn map_texture_declarations(source: &str) -> TextureDeclarationsOut {
    let out = fast3d::asm::texture_declarations(source);
    TextureDeclarationsOut {
        declarations: out
            .declarations
            .into_iter()
            .map(|declaration| TextureDeclOut {
                name: declaration.name,
                width: declaration.width,
                height: declaration.height,
                format: declaration.format,
                line: declaration.line,
            })
            .collect(),
        diags: out
            .diagnostics
            .into_iter()
            .map(|diag| DiagOut {
                line: diag.line,
                msg: diag.msg,
            })
            .collect(),
    }
}

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
fn borrow_texture_inputs(inputs: &[TextureInputIn]) -> Vec<fast3d::asm::TextureInput<'_>> {
    inputs
        .iter()
        .map(|input| fast3d::asm::TextureInput {
            name: &input.name,
            rgba8: &input.rgba,
            width: input.width,
            height: input.height,
        })
        .collect()
}

/// Present iff the walk rasterized something and emitted zero ERROR-severity diagnostics
/// (WARN-only DLs still render).
#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
fn should_present(summary: &DlSummary) -> bool {
    summary.renderable && summary.errors == 0
}

#[cfg(target_arch = "wasm32")]
fn to_js<T: Serialize>(v: &T) -> JsValue {
    serde_wasm_bindgen::to_value(v).unwrap_or(JsValue::NULL)
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = textureDeclarations)]
pub fn texture_declarations_js(source: &str) -> JsValue {
    to_js(&map_texture_declarations(source))
}

/// The N64-machine boundary for web: an owned RDRAM image (the assembled DL).
#[cfg(target_arch = "wasm32")]
struct WebHardware {
    rdram: Vec<u8>,
}
#[cfg(target_arch = "wasm32")]
impl Hardware for WebHardware {
    fn rdram(&self) -> impl Rdram + '_ {
        RdramImage::new(&self.rdram)
    }
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub struct Renderer {
    inner: Fast3dRenderer,
    hw: WebHardware,
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
impl Renderer {
    pub async fn init(canvas: HtmlCanvasElement) -> Result<Renderer, JsValue> {
        let (w, h) = (canvas.width(), canvas.height());
        let inner = Fast3dRenderer::new(
            wgpu::SurfaceTarget::Canvas(canvas),
            w,
            h,
            RendererConfig {
                resolution_multiplier: 1,
                sample_count: 1,
                present_mode: wgpu::PresentMode::AutoVsync,
                // None picks a deterministic non-sRGB format (avoids the sRGB washout).
                format: None,
                clear_policy: ClearPolicy::PerFrame,
                power_preference: wgpu::PowerPreference::default(),
            },
        )
        .await
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(Renderer {
            inner,
            hw: WebHardware { rdram: Vec::new() },
        })
    }

    /// Assemble the source with texture inputs, interpret it, and draw to the canvas.
    pub fn render(&mut self, source: &str, time: f32, textures: JsValue) -> JsValue {
        let inputs: Vec<TextureInputIn> = match serde_wasm_bindgen::from_value(textures) {
            Ok(inputs) => inputs,
            Err(error) => {
                return to_js(&RenderOut {
                    diags: Vec::new(),
                    is_time_variant: fast3d::asm::source_is_time_variant(source),
                    error: Some(format!("invalid texture inputs: {error}")),
                });
            }
        };
        let borrowed = borrow_texture_inputs(&inputs);
        let assembled = match fast3d::asm::assemble_at_with_textures(source, time, &borrowed) {
            Ok(a) => a,
            Err(diags) => {
                return to_js(&RenderOut {
                    diags: diags
                        .into_iter()
                        .map(|d| DiagOut {
                            line: d.line,
                            msg: d.msg,
                        })
                        .collect(),
                    is_time_variant: fast3d::asm::source_is_time_variant(source),
                    error: None,
                });
            }
        };
        let is_time_variant = assembled.is_time_variant;
        self.hw.rdram = assembled.image.rdram;

        let mut diags: Vec<Diagnostic> = Vec::new();
        self.inner.begin_frame();
        let summary = self.inner.process_dl(
            &self.hw,
            assembled.image.entry_addr as u64,
            Microcode::F3dex2,
            &mut diags,
        );
        let diag_out = map_diags(&diags);

        if !should_present(&summary) {
            return to_js(&RenderOut {
                diags: diag_out,
                is_time_variant,
                error: None,
            });
        }

        let error = match self.inner.present(&self.hw) {
            Ok(()) => None,
            Err(e) => Some(format!("present: {e:?}")),
        };
        to_js(&RenderOut {
            diags: diag_out,
            is_time_variant,
            error,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use fast3d::DiagKind;

    fn summary(renderable: bool, errors: u32, warns: u32) -> DlSummary {
        DlSummary {
            commands: 0,
            tris: 0,
            warns,
            errors,
            dropped_runs: 0,
            renderable,
        }
    }

    #[test]
    fn should_present_gates_on_renderable_and_zero_errors() {
        assert!(
            should_present(&summary(true, 0, 0)),
            "renderable + no errors -> present"
        );
        assert!(
            should_present(&summary(true, 0, 5)),
            "warn-only DLs now render (loosened gate; old web blocked on ANY diag)"
        );
        assert!(
            !should_present(&summary(true, 1, 0)),
            "an error blocks even when renderable"
        );
        assert!(
            !should_present(&summary(false, 0, 0)),
            "nothing rasterized -> nothing to present"
        );
        assert!(
            !should_present(&summary(false, 3, 2)),
            "not renderable (errors present) -> no present"
        );
    }

    #[test]
    fn map_diags_carries_byte_address_as_line_and_kind_display_as_msg() {
        let diags = vec![
            Diagnostic {
                at: 0x20,
                kind: DiagKind::DrawBeforeCimg,
            },
            Diagnostic {
                at: 0x1234,
                kind: DiagKind::UnknownOpcode(0xAB),
            },
        ];
        let out = map_diags(&diags);
        assert_eq!(out.len(), 2);
        assert_eq!(
            (out[0].line, out[0].msg.as_str()),
            (0x20, "draw before first CIMG")
        );
        assert_eq!(
            (out[1].line, out[1].msg.as_str()),
            (0x1234, "unknown opcode 0xAB")
        );
    }

    #[test]
    fn declaration_output_preserves_names_formats_and_diagnostics() {
        let out = map_texture_declarations(
            "Texture grass = { 32, 16, RGBA16 }\ninvalid\nTexture mask = { 8, 8, IA8 }",
        );
        assert_eq!(out.declarations[0].name, "grass");
        assert_eq!(out.declarations[1].format, "IA8");
        assert!(!out.diags.is_empty());
    }

    #[test]
    fn owned_inputs_borrow_for_fast3d() {
        let inputs = vec![TextureInputIn {
            name: "grass".into(),
            rgba: vec![255, 0, 0, 255],
            width: 1,
            height: 1,
        }];
        let borrowed = borrow_texture_inputs(&inputs);
        assert_eq!(borrowed[0].name, "grass");
        assert_eq!(borrowed[0].rgba8, &[255, 0, 0, 255]);
    }
}
