"""
AI 퀴즈 자산 생성 스크립트
- Gemini API로 이미지 생성 (건설/건물 주제)
- Gemini API로 감정이 담긴 음성 2개 생성 (둘 다 AI)
"""

from google import genai
from google.genai import types
import base64
import struct
import wave
import os

API_KEY = "AIzaSyCNPMFH3ugQ_Mmt8o9omhXTmnDhx4ML0t8"
ASSETS_DIR = os.path.join(os.path.dirname(__file__), "assets")

client = genai.Client(api_key=API_KEY)


def generate_image():
    """Gemini로 건설 현장/건물 AI 이미지 생성"""
    print("[1/3] AI 이미지 생성 중...")

    response = client.models.generate_content(
        model="gemini-2.5-flash-image",
        contents="Generate image: A stunning photorealistic image of a modern luxury apartment complex at golden hour sunset. The building has glass facades reflecting warm orange sunlight, surrounded by landscaped gardens with trees. Street level shows a clean sidewalk with pedestrians. Shot from a slight low angle, professional architectural photography style, 4K quality, vivid colors.",
        config=types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"]
        ),
    )

    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.mime_type.startswith("image/"):
            ext = part.inline_data.mime_type.split("/")[-1]
            if ext == "jpeg":
                ext = "jpg"
            path = os.path.join(ASSETS_DIR, f"quiz-ai-building.{ext}")
            with open(path, "wb") as f:
                f.write(part.inline_data.data)
            print(f"  -> 저장 완료: {path}")
            return path

    print("  -> 이미지 생성 실패, 텍스트 응답:")
    for part in response.candidates[0].content.parts:
        if part.text:
            print(f"     {part.text[:200]}")
    return None


def generate_voice_a():
    """Gemini TTS - 음성 A: 따뜻하고 감정적인 톤"""
    print("[2/3] AI 음성 A 생성 중 (따뜻한 톤)...")

    response = client.models.generate_content(
        model="gemini-2.5-flash-preview-tts",
        contents="안녕하세요, 오늘 이 자리에 함께 해주셔서 정말 감사합니다. AI 기술이 우리의 일상을 어떻게 바꿔가고 있는지, 함께 이야기 나눠보겠습니다.",
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name="Kore",
                    )
                )
            ),
        ),
    )

    data = b""
    for part in response.candidates[0].content.parts:
        if part.inline_data:
            data += part.inline_data.data

    if data:
        path = os.path.join(ASSETS_DIR, "quiz-voice-a.wav")
        save_wav(path, data)
        print(f"  -> 저장 완료: {path}")
        return path

    print("  -> 음성 A 생성 실패")
    return None


def generate_voice_b():
    """Gemini TTS - 음성 B: 차분하고 전문적인 톤"""
    print("[3/3] AI 음성 B 생성 중 (차분한 톤)...")

    response = client.models.generate_content(
        model="gemini-2.5-flash-preview-tts",
        contents="안녕하세요, 오늘 이 자리에 함께 해주셔서 정말 감사합니다. AI 기술이 우리의 일상을 어떻게 바꿔가고 있는지, 함께 이야기 나눠보겠습니다.",
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name="Aoede",
                    )
                )
            ),
        ),
    )

    data = b""
    for part in response.candidates[0].content.parts:
        if part.inline_data:
            data += part.inline_data.data

    if data:
        path = os.path.join(ASSETS_DIR, "quiz-voice-b.wav")
        save_wav(path, data)
        print(f"  -> 저장 완료: {path}")
        return path

    print("  -> 음성 B 생성 실패")
    return None


def save_wav(filename, pcm_data, channels=1, rate=24000, sample_width=2):
    """PCM 데이터를 WAV 파일로 저장"""
    with wave.open(filename, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(rate)
        wf.writeframes(pcm_data)


if __name__ == "__main__":
    print("=" * 50)
    print("AI 퀴즈 자산 생성 시작")
    print("=" * 50)

    img = generate_image()
    va = generate_voice_a()
    vb = generate_voice_b()

    print("\n" + "=" * 50)
    print("결과 요약:")
    print(f"  이미지: {'성공' if img else '실패'}")
    print(f"  음성 A: {'성공' if va else '실패'}")
    print(f"  음성 B: {'성공' if vb else '실패'}")
    print("=" * 50)
