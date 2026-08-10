// SPDX-License-Identifier: MIT

#include "Wrapper.h"

extern BOOL linearSoundInterpolation;

static void (REGPARM *getSamples)(void *samples, uint32_t num_samples_per_chn);

#ifdef NFS_CPP
	void wrap_regparm2(void *this, void *func, int32_t arg0, int32_t arg1);
	extern void *audio_game_thread;

	#define getSamplesFunc(a,b) \
		wrap_regparm2(audio_game_thread, getSamples, a, b)
#else
	#define getSamplesFunc(a,b) \
		getSamples(a, b)
#endif

typedef void (*FadeInOut)(MAYBE_THIS_SINGLE);
static FadeInOut fadeInOut;

#include <SDL2/SDL_audio.h>
#ifdef __EMSCRIPTEN__
	#include <emscripten/emscripten.h>
#endif

#define CHN_CNT 2

static BOOL canGetSamples;

#ifndef __EMSCRIPTEN__
	static SDL_AudioDeviceID audioDevice;
	static BOOL unPaused;
	static uint32_t buffer_pos;
	static uint8_t *buffer;
#endif

#ifdef __EMSCRIPTEN__
	#define WEB_AUDIO_CAPACITY 16384
	#define WEB_AUDIO_TARGET 2048
	#define WEB_AUDIO_CHUNK 256

	static int16_t webAudioRing[WEB_AUDIO_CAPACITY * CHN_CNT];
	static int16_t webAudioMixBuffer[WEB_AUDIO_CHUNK * CHN_CNT];
	static uint32_t webAudioReadIndex;
	static uint32_t webAudioWriteIndex;
	static uint32_t webAudioSampleRate;

	EMSCRIPTEN_KEEPALIVE uint32_t nfsWebAudioBuffer(void)
	{
		return (uint32_t)(uintptr_t)webAudioRing;
	}
	EMSCRIPTEN_KEEPALIVE uint32_t nfsWebAudioReadIndex(void)
	{
		return (uint32_t)(uintptr_t)&webAudioReadIndex;
	}
	EMSCRIPTEN_KEEPALIVE uint32_t nfsWebAudioWriteIndex(void)
	{
		return (uint32_t)(uintptr_t)&webAudioWriteIndex;
	}
	EMSCRIPTEN_KEEPALIVE uint32_t nfsWebAudioCapacity(void)
	{
		return WEB_AUDIO_CAPACITY;
	}
	EMSCRIPTEN_KEEPALIVE uint32_t nfsWebAudioSampleRate(void)
	{
		return webAudioSampleRate;
	}

	static void writeWebAudioSamples(void)
	{
		uint32_t readIndex = __atomic_load_n(&webAudioReadIndex, __ATOMIC_ACQUIRE);
		uint32_t writeIndex = __atomic_load_n(&webAudioWriteIndex, __ATOMIC_RELAXED);
		uint32_t bufferedFrames = writeIndex - readIndex;
		uint32_t frameOffset, firstFrames;

		if (bufferedFrames > WEB_AUDIO_CAPACITY)
		{
			readIndex = writeIndex;
			bufferedFrames = 0;
			__atomic_store_n(&webAudioReadIndex, readIndex, __ATOMIC_RELEASE);
		}

		while (bufferedFrames < WEB_AUDIO_TARGET)
		{
			getSamplesFunc(webAudioMixBuffer, WEB_AUDIO_CHUNK);
			frameOffset = writeIndex % WEB_AUDIO_CAPACITY;
			firstFrames = WEB_AUDIO_CAPACITY - frameOffset;
			if (firstFrames > WEB_AUDIO_CHUNK)
				firstFrames = WEB_AUDIO_CHUNK;

			memcpy(
				webAudioRing + frameOffset * CHN_CNT,
				webAudioMixBuffer,
				firstFrames * CHN_CNT * sizeof(int16_t)
			);
			if (firstFrames < WEB_AUDIO_CHUNK)
			{
				memcpy(
					webAudioRing,
					webAudioMixBuffer + firstFrames * CHN_CNT,
					(WEB_AUDIO_CHUNK - firstFrames) * CHN_CNT * sizeof(int16_t)
				);
			}

			writeIndex += WEB_AUDIO_CHUNK;
			bufferedFrames += WEB_AUDIO_CHUNK;
		}

		__atomic_store_n(&webAudioWriteIndex, writeIndex, __ATOMIC_RELEASE);
	}
#endif

#ifndef __EMSCRIPTEN__
static void audioCallback(void *userdata, uint8_t *stream, int32_t len)
{
	if (!buffer)
	{
		int32_t i;
		for (i = 0; i < len; i += 256 * CHN_CNT * sizeof(int16_t))
			getSamplesFunc(stream + i, 256);
	}
	else
	{
		while (buffer_pos < len)
		{
			getSamplesFunc(buffer + buffer_pos, 256);
			buffer_pos += 256 * CHN_CNT * sizeof(int16_t);
		}
		memcpy(stream, buffer, len);
		memcpy(buffer, buffer + len, buffer_pos -= len);
	}
}
static void audioCallbackInterp(void *userdata, uint8_t *stream, int32_t len)
{
	int16_t samples[256 * CHN_CNT];
	int16_t *buffer_16b;
	uint32_t i, c;
	while (buffer_pos < len)
	{
		buffer_16b = (int16_t *)(buffer + buffer_pos);
		getSamplesFunc(samples, 256);
		for (i = 0; i < (256 - 1) * CHN_CNT; i += CHN_CNT)
		{
			for (c = 0; c < CHN_CNT; ++c)
			{
				buffer_16b[c] = samples[i + c];
				buffer_16b[c + CHN_CNT] = (samples[i + c] + samples[i + c + CHN_CNT]) >> 1;
			}
			buffer_16b += CHN_CNT << 1;
		}
		for (c = 0; c < CHN_CNT; ++c)
			buffer_16b[c] = buffer_16b[c + CHN_CNT] = samples[i + c];
		buffer_pos += 512 * CHN_CNT * sizeof(int16_t);
	}
	memcpy(stream, buffer, len);
	memcpy(buffer, buffer + len, buffer_pos -= len);
}
#endif

/**/

REALIGN uint32_t iSNDdllversion_(void)
{
	return 0x60002;
}

REALIGN STDCALL uint32_t iSNDdirectsetfunctions_wrap(void (REGPARM *arg1)(), void (*arg2)(), void (*arg3)(), FadeInOut arg4, void (*arg5)())
{
	getSamples = arg1;
	fadeInOut  = arg4;
	return 0;
}
REALIGN REGPARM uint32_t iSNDdirectcaps_(void *hWnd)
{
	return 0x23E0F; //?
}
REALIGN REGPARM uint32_t iSNDdirectstart_(uint32_t arg1, void *hWnd)
{
	if (canGetSamples)
		return 0;

#ifdef __EMSCRIPTEN__
	webAudioSampleRate = linearSoundInterpolation ? 44100 : 22050;
	__atomic_store_n(&webAudioReadIndex, 0, __ATOMIC_RELEASE);
	__atomic_store_n(&webAudioWriteIndex, 0, __ATOMIC_RELEASE);
#else
	SDL_AudioSpec audioSpecIn =
	{
		linearSoundInterpolation ? 44100 : 22050,
		AUDIO_S16,
		CHN_CNT,
		0,
		1024,
		0,
		0,
		linearSoundInterpolation ? audioCallbackInterp : audioCallback,
		NULL
	};
	SDL_AudioSpec audioSpecOut;
	audioDevice = SDL_OpenAudioDevice(NULL, 0, &audioSpecIn, &audioSpecOut, 0);
	if (!audioDevice)
	{
		fprintf(stderr, "SDL audio device failed: %s\n", SDL_GetError());
		buffer = (uint8_t *)malloc(256 * CHN_CNT * sizeof(int16_t));
	}
	else
	{
		uint32_t bufferSize = (audioSpecOut.samples + 255) & ~255; //Aligned to 256
		if (linearSoundInterpolation || bufferSize != audioSpecOut.samples)
		{
			bufferSize += linearSoundInterpolation ? 512 : 256;
			bufferSize *= CHN_CNT * sizeof(int16_t);
			buffer = (uint8_t *)malloc(bufferSize);
		}
	}
#endif
	canGetSamples = true;
	return 0;
}
REALIGN void iSNDdirectserve_(MAYBE_THIS_SINGLE)
{
	if (canGetSamples)
	{
		#ifndef __EMSCRIPTEN__
		if (!unPaused && audioDevice)
		{
			SDL_PauseAudioDevice(audioDevice, 0);
			unPaused = true;
		}
		#endif
#ifdef NFS_CPP
		fadeInOut(this);
#else
		fadeInOut();
#endif
		#ifdef __EMSCRIPTEN__
		writeWebAudioSamples();
		#else
		if (!audioDevice)
			getSamplesFunc(buffer, 256);
		#endif
	}
}
REALIGN uint32_t iSNDdirectstop_(void)
{
	canGetSamples = false;
#ifndef __EMSCRIPTEN__
	if (audioDevice)
	{
		SDL_CloseAudioDevice(audioDevice);
		unPaused = false;
		audioDevice = 0;
	}
	buffer_pos = 0;
	free(buffer);
	buffer = NULL;
#else
	webAudioSampleRate = 0;
	__atomic_store_n(&webAudioReadIndex, 0, __ATOMIC_RELEASE);
	__atomic_store_n(&webAudioWriteIndex, 0, __ATOMIC_RELEASE);
#endif
	return 0;
}
