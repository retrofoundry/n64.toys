//! GBI assembler: C-like gbi-macro source -> bit-accurate big-endian GBI image.
// The implementation lives in an internal `asm` submodule. Suppress the module-inception lint.
#[allow(clippy::module_inception)]
pub(crate) mod asm;
mod expr;
mod opcode;
mod parser;
pub use opcode::opcode_name;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Microcode {
    #[default]
    F3dex2,
    F3d,
}

pub use asm::{
    analyze, assemble, assemble_at, assemble_at_with_textures, assemble_with_texture, Analysis,
    Image, TextureDecl, TextureInput,
};
pub use parser::Diag;

#[cfg(test)]
mod tests {
    use crate::asm::{encode_i4_pair, encode_ia4_nibble, encode_ia4_pair};

    #[test]
    fn i4_pair_packs_high_nibble_even() {
        let byte = encode_i4_pair(0xF, 0x0);
        assert_eq!(byte >> 4, 0xF);
        assert_eq!(byte & 0xF, 0x0);
    }

    #[test]
    fn ia4_pair_packs_high_nibble_even() {
        let n0 = encode_ia4_nibble(255, 255, 255, 255);
        let n1 = encode_ia4_nibble(0, 0, 0, 0);
        assert_eq!(n0, 0xF);
        assert_eq!(n1, 0x0);
        let byte = encode_ia4_pair(n0, n1);
        assert_eq!(byte, 0xF0);
    }
}

#[cfg(test)]
mod compiler_tests;
