## Setup for downloading APKs

```sh
git clone https://github.com/89z/googleplay.git
cd googleplay/cmd/googleplay
go build

./googleplay -email <email> -password <app password>
./googleplay -device -p 1 # armeabi-v7a
```
