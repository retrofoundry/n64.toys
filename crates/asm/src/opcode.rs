use crate::Microcode;

pub fn opcode_name(microcode: Microcode, opcode: u8) -> Option<&'static str> {
    macro_rules! names {
        ($module:ident; $($name:ident),* $(,)?) => {{
            use n64_gbi::consts::$module::*;
            match opcode {
                $($name => Some(stringify!($name)),)*
                _ => None,
            }
        }};
    }
    let rsp = match microcode {
        Microcode::F3dex2 => names!(rsp_f3dex2;
            G_VTX, G_TRI1, G_TRI2, G_GEOMETRYMODE, G_MTX, G_MOVEMEM, G_ENDDL,
            G_TEXTURE, G_SETOTHERMODE_H, G_SETOTHERMODE_L, G_DL, G_MOVEWORD, G_POPMTX),
        Microcode::F3d => names!(rsp_f3d;
            G_SPNOOP, G_MTX, G_MOVEMEM, G_VTX, G_DL, G_SPRITE2D_BASE, G_RDPHALF_2,
            G_RDPHALF_1, G_QUAD, G_CLEARGEOMETRYMODE, G_SETGEOMETRYMODE, G_ENDDL,
            G_SETOTHERMODE_L, G_SETOTHERMODE_H, G_TEXTURE, G_MOVEWORD, G_POPMTX,
            G_CULLDL, G_TRI1, G_RDPNOOP),
    };
    rsp.or_else(|| {
        if microcode == Microcode::F3d && matches!(opcode, 0xE1 | 0xF1) {
            return None;
        }
        names!(rdp;
            G_NOOP, G_SETTIMG, G_SETCOMBINE, G_SETENVCOLOR, G_SETPRIMCOLOR,
            G_SETTILE, G_LOADBLOCK, G_LOADTILE, G_LOADTLUT, G_SETTILESIZE,
            G_RDPLOADSYNC, G_RDPPIPESYNC, G_RDPTILESYNC, G_RDPFULLSYNC,
            G_RDPSETOTHERMODE, G_SETFOGCOLOR, G_SETBLENDCOLOR, G_TEXRECT,
            G_TEXRECTFLIP, G_FILLRECT, G_SETFILLCOLOR, G_SETSCISSOR, G_SETCIMG,
            G_SETZIMG, G_RDPHALF_1, G_RDPHALF_2)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn f3dex2_names() {
        for (opcode, name) in [
            (0x05, "G_TRI1"),
            (0xDF, "G_ENDDL"),
            (0xFF, "G_SETCIMG"),
            (0xE1, "G_RDPHALF_1"),
        ] {
            assert_eq!(opcode_name(Microcode::F3dex2, opcode), Some(name));
        }
        assert_eq!(opcode_name(Microcode::F3dex2, 0xAB), None);
    }

    #[test]
    fn f3d_names() {
        for (opcode, name) in [
            (0xBF, "G_TRI1"),
            (0xB8, "G_ENDDL"),
            (0xFF, "G_SETCIMG"),
            (0xB4, "G_RDPHALF_1"),
        ] {
            assert_eq!(opcode_name(Microcode::F3d, opcode), Some(name));
        }
        assert_eq!(opcode_name(Microcode::F3d, 0xE1), None);
    }

    #[test]
    fn collisions_use_the_selected_microcode() {
        assert_eq!(opcode_name(Microcode::F3dex2, 0x01), Some("G_VTX"));
        assert_eq!(opcode_name(Microcode::F3d, 0x01), Some("G_MTX"));
        assert_eq!(opcode_name(Microcode::F3dex2, 0x06), Some("G_TRI2"));
        assert_eq!(opcode_name(Microcode::F3d, 0x06), Some("G_DL"));
    }
}
