#!/bin/bash

if [ $# -ne 3 ]; then
    echo -e "usage: $0 <googleplay_binary> <app_id_list> <out_dir>"
    exit 1;
fi

err_count=0

for app_id in $(cat "$2" | shuf)
do
    googleplay="$1"
    out_dir="$3"
    cd "$out_dir"

    if [ ! -f "${out_dir}/${app_id}.apk" ]; then
        version=`"$1" -a "$app_id" -p 1 | grep "Version Code:" | cut -d " " -f3-`
        if $googleplay -a "$app_id" -purchase && $googleplay -a "$app_id" -v "$version" -s -p 1; then
            mv "${app_id}-${version}.apk" "${app_id}.apk"
            err_count=0
        else
            err_count=$((err_count + 1))
            echo $err_count
        fi
    fi

    sleep $((err_count * 60))
done
