# SafeRoute (TAAS1) — Vercel 배포판

초보 운전자 경로 비교 서비스 SafeRoute를 Vercel에 올릴 수 있게 바꾼 버전입니다.
도로 위험도는 실제 사고 기록(TAAS 2020~2024, 천안·아산)으로 학습한 TAAS1 모델의 전국 도로 위험 순위입니다.

## 구조

| 경로 | 내용 |
|---|---|
| `public/` | 화면 (index.html, app.js, style.css) — 정적 파일 |
| `api/router.js` | 서버리스 함수 하나가 `/api/status`, `/api/places`, `/api/routes` 처리 |
| `lib/matcher.js`, `lib/kakao.js` | 도로 매칭·P01 점수, 카카오 장소·경로 호출 (로컬 배포판과 같은 코드) |
| `lib/data/` | 전국 도로 타일 1,172개(TAAS1 점수), 정책·매니페스트 |
| `model/` | TAAS1 LightGBM 모델 파일과 빌드 요약(배포에는 안 쓰임, 기록용) |
| `vercel.json` | 함수에 `lib/data` 포함, 최대 실행 60초, `/api/*` → `api/router.js` 연결 |
| `dev-server.js` | 이 PC에서 같은 구조로 시험하는 로컬 서버 (`node dev-server.js`) |

## 카카오 키

- **REST API 키는 사용자가 화면에서 직접 입력합니다.** 서버나 Vercel 환경변수에 저장하지 않고, 검색할 때마다 카카오로만 전달합니다.
- **지도(JavaScript 키)**: 카카오 개발자센터 → 앱 → 플랫폼 → Web의 사이트 도메인에 배포 주소(예: `https://saferoute-xxxx.vercel.app`)를 등록해야 지도가 보입니다.
- 경로 검색에는 카카오모빌리티 길찾기 API 사용 권한이 필요합니다.

## 배포 방법

1. 이 폴더를 GitHub 저장소로 올립니다.
2. Vercel → Add New → Project → 저장소 Import.
3. Framework Preset: **Other**, Build Command: 비움, Output Directory: 비움(`public/`이 자동으로 정적 파일이 됨).
4. Deploy 후 나온 주소를 카카오 JavaScript SDK 도메인에 등록합니다.

## 로컬 시험

```
node dev-server.js
```
`http://127.0.0.1:3000` — 카카오 지도를 보려면 이 주소도 JavaScript SDK 도메인에 등록해야 합니다.

## 주의

- 긴 경로(예: 서울→부산)는 카카오 호출 여러 번과 타일 매칭을 한 요청에서 합니다. Vercel 요금제의 함수 실행 시간 제한을 넘으면 `maxDuration`을 조정하세요.
- 점수는 사고 확률이 아니라 위험 순위입니다. 교통량을 반영하지 못해 차가 많은 큰길을 위험하게 볼 수 있습니다.
- 출처: TAAS 교통사고분석시스템(한국도로교통공단), 국가표준노드링크, Kakao Local·Mobility API.
