APPNAME="Epidemic"

# options

buildexternalsfromsource=
PARALLEL_BUILD_FLAG=

usage(){
cat << EOF
usage: $0 [options]

Build C/C++ code for $APPNAME using Android NDK

OPTIONS:
-s	Build externals from source
-p  Run make with -j8 option to take advantage of multiple processors
-h	this help
EOF
}

while getopts "sph" OPTION; do
case "$OPTION" in
s)
buildexternalsfromsource=1
;;
p)
PARALLEL_BUILD_FLAG=\-j8
;;
h)
usage
exit 0
;;
esac
done

# exit this script if any commmand fails
set -e

# paths


if [ -z "${NDK_ROOT+aaa}" ];then
echo "please define NDK_ROOT"
exit 1
fi

# For compatibility of android-ndk-r9, 4.7 was removed from r9
if [ -d "${NDK_ROOT}/toolchains/arm-linux-androideabi-4.7" ]; then
    export NDK_TOOLCHAIN_VERSION=4.7
    echo "The Selected NDK toolchain version was 4.7 !"
else
    if [ -d "${NDK_ROOT}/toolchains/arm-linux-androideabi-4.8" ]; then
        export NDK_TOOLCHAIN_VERSION=4.8
        echo "The Selected NDK toolchain version was 4.8 !"
    else
        echo "Couldn't find the gcc toolchain."
        exit 1
    fi
fi

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# ... use paths relative to current directory
COCOS2DX_ROOT="$DIR/../../.."
APP_ROOT="$DIR/.."
APP_ANDROID_ROOT="$DIR"
BINDINGS_JS_ROOT="$APP_ROOT/../../scripting/javascript/bindings/js"

echo
echo "Paths"
echo "    NDK_ROOT = $NDK_ROOT"
echo "    COCOS2DX_ROOT = $COCOS2DX_ROOT"
echo "    APP_ROOT = $APP_ROOT"
echo "    APP_ANDROID_ROOT = $APP_ANDROID_ROOT"
echo

# Debug
set -x

# make sure assets is exist
if [ -d "$APP_ANDROID_ROOT"/assets ]; then
    rm -rf "$APP_ANDROID_ROOT"/assets
fi

mkdir "$APP_ANDROID_ROOT"/assets
mkdir "$APP_ANDROID_ROOT"/assets/res

# copy Resources/* into assets' root
cp -rf "$APP_ROOT"/Resources/* "$APP_ANDROID_ROOT"/assets


# copy bindings/*.js into assets' root
cp -f "$BINDINGS_JS_ROOT"/* "$APP_ANDROID_ROOT"/assets

echo "Using prebuilt externals"
echo

set -x

"$NDK_ROOT"/ndk-build $PARALLEL_BUILD_FLAG -C "$APP_ANDROID_ROOT" $* \
    "NDK_MODULE_PATH=${COCOS2DX_ROOT}:${COCOS2DX_ROOT}/cocos2dx/platform/third_party/android/prebuilt" \
    NDK_LOG=0 V=0
