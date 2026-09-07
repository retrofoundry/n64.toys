use crate::{parse_microcode, prepare_render, DiagOut};
use fast3d::inspect::{self, Emission, StateView, WalkObserver, WalkStep, WalkTermination};
use serde::Serialize;
use std::{collections::BTreeSet, ops::ControlFlow};

fn hex(value: impl Into<u64>) -> String {
    format!("0x{:08X}", value.into())
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Image {
    fmt: u8,
    siz: u8,
    width: u16,
    addr: String,
}
impl From<inspect::ColorImage> for Image {
    fn from(v: inspect::ColorImage) -> Self {
        Self {
            fmt: v.fmt,
            siz: v.siz,
            width: v.width,
            addr: hex(v.addr),
        }
    }
}
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pair_index: usize,
    color_image: Image,
    depth_image: Option<String>,
    is_depth_clear: bool,
}
impl From<inspect::FramebufferTarget> for Target {
    fn from(v: inspect::FramebufferTarget) -> Self {
        Self {
            pair_index: v.pair_index,
            color_image: v.color_image.into(),
            depth_image: v.depth_image.map(hex),
            is_depth_clear: v.is_depth_clear,
        }
    }
}
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Texture {
    tile: u8,
    level: u8,
    on: bool,
    sc: u16,
    tc: u16,
}
impl From<&inspect::TextureState> for Texture {
    fn from(v: &inspect::TextureState) -> Self {
        Self {
            tile: v.tile,
            level: v.level,
            on: v.on,
            sc: v.sc,
            tc: v.tc,
        }
    }
}
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tile {
    uls: u16,
    ult: u16,
    lrs: u16,
    lrt: u16,
    width: u16,
    height: u16,
    fmt: u8,
    siz: u8,
    palette: u8,
    cms: u8,
    cmt: u8,
    masks: u8,
    maskt: u8,
    shifts: u8,
    shiftt: u8,
    line: u16,
    tmem_addr: u16,
}
impl From<&inspect::TileDescriptor> for Tile {
    fn from(v: &inspect::TileDescriptor) -> Self {
        Self {
            uls: v.uls,
            ult: v.ult,
            lrs: v.lrs,
            lrt: v.lrt,
            width: v.width,
            height: v.height,
            fmt: v.fmt,
            siz: v.siz,
            palette: v.palette,
            cms: v.cms,
            cmt: v.cmt,
            masks: v.masks,
            maskt: v.maskt,
            shifts: v.shifts,
            shiftt: v.shiftt,
            line: v.line,
            tmem_addr: v.tmem_addr,
        }
    }
}
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Scissor {
    ulx: i32,
    uly: i32,
    lrx: i32,
    lry: i32,
    mode: u8,
}
impl From<&inspect::Scissor> for Scissor {
    fn from(v: &inspect::Scissor) -> Self {
        Self {
            ulx: v.ulx,
            uly: v.uly,
            lrx: v.lrx,
            lry: v.lry,
            mode: v.mode,
        }
    }
}
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct State {
    geometry_mode: String,
    geometry_names: Vec<&'static str>,
    texture: Texture,
    modelview_depth: usize,
    modelview: inspect::Matrix4,
    projection: inspect::Matrix4,
    viewport_scale: [f32; 3],
    viewport_translation: [f32; 3],
    light_count: u32,
    lights: [([f32; 3], [f32; 3]); 8],
    ambient: [f32; 3],
    lookat_axes: [[f32; 3]; 2],
    tiles: Vec<Tile>,
    load_via_tile: bool,
    texture_image: Image,
    combine_l: String,
    combine_h: String,
    other_mode_h: String,
    other_mode_l: String,
    prim_color: [u8; 4],
    env_color: [u8; 4],
    fog_color: [u8; 4],
    blend_color: [u8; 4],
    fill_color_raw: String,
    color_image: Image,
    depth_image: String,
    scissor: Scissor,
}
impl From<StateView<'_>> for State {
    fn from(v: StateView<'_>) -> Self {
        Self {
            geometry_mode: hex(v.geometry_mode),
            geometry_names: v.geometry_names.iter().map(|f| f.name).collect(),
            texture: (&v.texture).into(),
            modelview_depth: v.modelview_depth,
            modelview: *v.modelview,
            projection: *v.projection,
            viewport_scale: v.viewport_scale,
            viewport_translation: v.viewport_translation,
            light_count: v.light_count,
            lights: *v.lights,
            ambient: v.ambient,
            lookat_axes: *v.lookat_axes,
            tiles: v.tiles.iter().map(Tile::from).collect(),
            load_via_tile: v.load_via_tile,
            texture_image: v.texture_image.into(),
            combine_l: hex(v.combine_l),
            combine_h: hex(v.combine_h),
            other_mode_h: hex(v.other_mode_h),
            other_mode_l: hex(v.other_mode_l),
            prim_color: v.prim_color,
            env_color: v.env_color,
            fog_color: v.fog_color,
            blend_color: v.blend_color,
            fill_color_raw: hex(v.fill_color_raw),
            color_image: v.color_image.into(),
            depth_image: hex(v.depth_image),
            scissor: (&v.scissor).into(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Draw {
    Triangles {
        target: Option<Target>,
        run_index: Option<u32>,
        op_index: Option<u32>,
        material_index: u32,
        render_mode_index: u32,
        index_start: u32,
        indices: Vec<u32>,
    },
    FillRect {
        target: Target,
        op_index: u32,
        rect: [i32; 4],
        color_raw: String,
    },
    TexRect {
        target: Target,
        op_index: u32,
        rect: [i32; 4],
        tile: u8,
        uls: i16,
        ult: i16,
        dsdx: i16,
        dtdy: i16,
        flip: bool,
        copy_mode: bool,
        fb_source: Option<String>,
    },
}
impl From<&Emission<'_>> for Draw {
    fn from(v: &Emission<'_>) -> Self {
        match *v {
            Emission::Triangles {
                target,
                run_index,
                op_index,
                material_index,
                render_mode_index,
                index_start,
                indices,
                ..
            } => Self::Triangles {
                target: target.map(Into::into),
                run_index,
                op_index,
                material_index,
                render_mode_index,
                index_start,
                indices: indices.to_vec(),
            },
            Emission::FillRect {
                target,
                op_index,
                rect,
                color_raw,
                ..
            } => Self::FillRect {
                target: target.into(),
                op_index,
                rect: [rect.ulx, rect.uly, rect.lrx, rect.lry],
                color_raw: hex(color_raw),
            },
            Emission::TexRect {
                target,
                op_index,
                rect,
                tile,
                uls,
                ult,
                dsdx,
                dtdy,
                flip,
                copy_mode,
                fb_source,
                ..
            } => Self::TexRect {
                target: target.into(),
                op_index,
                rect: [rect.ulx, rect.uly, rect.lrx, rect.lry],
                tile,
                uls,
                ult,
                dsdx,
                dtdy,
                flip,
                copy_mode,
                fb_source: fb_source.map(hex),
            },
        }
    }
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Word {
    pc: String,
    line: Option<usize>,
    w0: String,
    w1: String,
    w1_addr: String,
}
#[derive(Debug, Serialize)]
pub struct Decoded {
    mnemonic: &'static str,
    operands: [(); 0],
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    seq: u32,
    pc: String,
    line: Option<usize>,
    depth_before: usize,
    depth_after: usize,
    flow: &'static str,
    next_pc: Option<String>,
    words: Vec<Word>,
    decoded: Decoded,
    state: usize,
    draws: Vec<Draw>,
    diagnostics: Vec<usize>,
}
#[derive(Serialize)]
pub struct TraceDiagnostic {
    #[serde(flatten)]
    diag: DiagOut,
    pc: Option<String>,
    seq: Option<u32>,
}
#[derive(Serialize)]
pub struct SourceLine {
    line: usize,
    text: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceOut {
    version: u8,
    time: f32,
    microcode: String,
    entry: Option<String>,
    termination: &'static str,
    dispatched: u32,
    rows: Vec<Row>,
    states: Vec<State>,
    source_lines: Vec<SourceLine>,
    diags: Vec<TraceDiagnostic>,
    error: Option<String>,
}
fn termination(value: WalkTermination) -> &'static str {
    match value {
        WalkTermination::End => "end",
        WalkTermination::Bounds => "bounds",
        WalkTermination::Runaway => "runaway",
        WalkTermination::ObserverStopped => "stopped",
        WalkTermination::Cap => "cap",
        WalkTermination::MemoryRead => "memory-read",
        WalkTermination::Rejected => "rejected",
        _ => "unknown",
    }
}
struct Collector<'a> {
    image: &'a n64_toys_asm::Image,
    microcode: n64_toys_asm::Microcode,
    rows: Vec<Row>,
    states: Vec<State>,
    lines: BTreeSet<usize>,
    stop_after: Option<u32>,
}
impl WalkObserver for Collector<'_> {
    fn command(&mut self, step: WalkStep<'_>) -> ControlFlow<()> {
        let state = State::from(step.state);
        if self.states.last() != Some(&state) {
            self.states.push(state);
        }
        let words = step
            .words
            .iter()
            .map(|word| {
                let line = self.image.line_at(word.pc);
                if let Some(line) = line {
                    self.lines.insert(line);
                }
                Word {
                    pc: hex(word.pc),
                    line,
                    w0: hex(word.w0),
                    w1: hex(word.w1),
                    w1_addr: hex(word.w1_addr),
                }
            })
            .collect();
        self.rows.push(Row {
            seq: step.seq,
            pc: hex(step.pc),
            line: self.image.line_at(step.pc),
            depth_before: step.depth_before,
            depth_after: step.depth_after,
            flow: match step.flow {
                inspect::WalkFlow::Next => "next",
                inspect::WalkFlow::Call => "call",
                inspect::WalkFlow::Branch => "branch",
                inspect::WalkFlow::Return => "return",
                inspect::WalkFlow::End => "end",
                _ => "fault",
            },
            next_pc: step.next_pc.map(hex),
            words,
            decoded: Decoded {
                mnemonic: n64_toys_asm::opcode_name(self.microcode, (step.words[0].w0 >> 24) as u8)
                    .unwrap_or("unknown"),
                operands: [],
            },
            state: self.states.len() - 1,
            draws: step.emissions.iter().map(Draw::from).collect(),
            diagnostics: (step.diagnostics_start..step.diagnostics_start + step.diagnostics.len())
                .collect(),
        });
        if self.stop_after == Some(step.seq + 1) {
            ControlFlow::Break(())
        } else {
            ControlFlow::Continue(())
        }
    }
}
pub fn capture(
    source: &str,
    time: f32,
    textures: &[n64_toys_asm::TextureInput<'_>],
    microcode: &str,
) -> TraceOut {
    let mut out = TraceOut {
        version: 1,
        time,
        microcode: microcode.into(),
        entry: None,
        termination: "stopped",
        dispatched: 0,
        rows: vec![],
        states: vec![],
        source_lines: vec![],
        diags: vec![],
        error: None,
    };
    let Some(targets) = parse_microcode(microcode) else {
        out.error = Some(format!("unknown microcode: {microcode}"));
        return out;
    };
    let prepared = match prepare_render(source, time, textures, targets) {
        Ok(prepared) => prepared,
        Err(diags) => {
            out.diags = diags
                .into_iter()
                .map(|d| TraceDiagnostic {
                    diag: DiagOut {
                        line: d.line,
                        kind: if d.line == 0 { "none" } else { "src" },
                        msg: d.msg,
                        severity: "error",
                    },
                    pc: None,
                    seq: None,
                })
                .collect();
            out.error = Some("assembly failed".into());
            return out;
        }
    };
    let image = &prepared.image;
    let mut collector = Collector {
        image,
        microcode: targets.assembler,
        rows: vec![],
        states: vec![],
        lines: BTreeSet::new(),
        stop_after: None,
    };
    let summary = inspect::walk(
        fast3d::RdramImage::new(&image.rdram),
        u64::from(image.entry_addr),
        prepared.microcode,
        fast3d::DataFormat::Fixed,
        &mut collector,
    );
    out.entry = Some(hex(image.entry_addr));
    out.termination = termination(summary.termination);
    out.dispatched = summary.dispatched;
    out.diags = crate::map_diags(&summary.diagnostics, &image.source_map)
        .into_iter()
        .enumerate()
        .map(|(index, diag)| TraceDiagnostic {
            diag,
            pc: Some(hex(summary.diagnostics[index].at)),
            seq: collector
                .rows
                .iter()
                .find(|r| r.diagnostics.contains(&index))
                .map(|r| r.seq),
        })
        .collect();
    out.source_lines = source
        .lines()
        .enumerate()
        .filter(|(index, _)| collector.lines.contains(&(index + 1)))
        .map(|(index, text)| SourceLine {
            line: index + 1,
            text: text.into(),
        })
        .collect();
    out.rows = collector.rows;
    out.states = collector.states;
    out
}

#[cfg(target_arch = "wasm32")]
pub fn input_error(time: f32, microcode: &str, error: String) -> TraceOut {
    TraceOut {
        version: 1,
        time,
        microcode: microcode.into(),
        entry: None,
        termination: "stopped",
        dispatched: 0,
        rows: vec![],
        states: vec![],
        source_lines: vec![],
        diags: vec![],
        error: Some(error),
    }
}
#[cfg(test)]
mod tests;
