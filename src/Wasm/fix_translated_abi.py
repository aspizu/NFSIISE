#!/usr/bin/env python3

import sys
from pathlib import Path


VOID_IMPORTS = (
    "DeleteCriticalSection_wrap",
    "EnterCriticalSection_wrap",
    "ExitProcess_wrap",
    "GetSystemInfo_wrap",
    "GlobalMemoryStatus_wrap",
    "InitializeCriticalSection_wrap",
    "LeaveCriticalSection_wrap",
    "SDL_Delay_wrap",
    "WrapperAtExit",
    "WrapperInit",
    "fetchTrackRecords",
    "free_wrap",
    "grAlphaBlendFunction",
    "grAlphaCombine",
    "grAlphaTestFunction",
    "grAlphaTestReferenceValue",
    "grBufferClear",
    "grBufferSwap",
    "grChromakeyMode",
    "grChromakeyValue",
    "grClipWindow",
    "grColorCombine",
    "grCullMode",
    "grDepthBiasLevel",
    "grDepthBufferFunction",
    "grDepthBufferMode",
    "grDepthMask",
    "grDitherMode",
    "grDrawLine",
    "grDrawTriangle",
    "grFogColorValue",
    "grFogMode",
    "grFogTable",
    "grGammaCorrectionValue",
    "grGlideInit",
    "grGlideShutdown",
    "grRenderBuffer",
    "grSstIdle",
    "grSstSelect",
    "grSstWinClose",
    "grTexClampMode",
    "grTexCombine",
    "grTexCombineFunction",
    "grTexDownloadMipMap",
    "grTexDownloadTable",
    "grTexFilterMode",
    "grTexMipMapMode",
    "grTexSource",
    "guFogGenerateExp",
    "iSNDdirectserve_",
    "startTimer",
    "stopTimer",
)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(f"Usage: {sys.argv[0]} NFS2SE.cpp")

    path = Path(sys.argv[1])
    source = path.read_text(encoding="utf-8")

    for name in VOID_IMPORTS:
        declaration = f'extern "C" int32_t {name}('
        call = f"eax = {name}("

        if source.count(declaration) != 1:
            raise SystemExit(f"Expected one translated declaration for {name}")
        if call not in source:
            raise SystemExit(f"Expected at least one translated call to {name}")

        source = source.replace(declaration, f'extern "C" void {name}(')
        source = source.replace(call, f"{name}(")

    path.write_text(source, encoding="utf-8")


if __name__ == "__main__":
    main()
