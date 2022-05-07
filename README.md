# ChooseImageView
taro react 图片上传组件

本项目是基于taro框架的react语言开发，项目中有需要做图片上传的需求，需要支持多图上传，支持图片删除，支持自动添加新增按钮，支持预览功能，支持显示默认图片等功能
要实现以上功能，使用小程序自带的上传组件已经不能够满足项目需求了，于是抱着学习的态度，开始动手撸一个图片上传框架
[toc]

## 介绍
本篇要介绍的自定义组件ChooseImageView具有以下功能
* 支持多张图片同时上传
* 支持大图上传图片超过一定范围自动压缩【30M以上的图片能成功上传】
* 支持显示默认图片isDefault=true
* 支持已添加图片的删除功能
* 支持图片预览功能
* 支持详情功能传入mode=“detail”即可实现详情功能
![](https://img2022.cnblogs.com/blog/950551/202205/950551-20220507105948539-575871482.jpg)

## 布局
页面布局和scss样式
```
<View className="chooseImageView" >
  <View className="choose-img-wrap">
    {files.map(data => {
      return (
        <View className='img-container' key={data.url}>
          <Image
            className='img'
            key={data.url}
            onClick={this.onImageClick.bind(this, data)}
            src={data.url}
            lazyLoad
            mode={data.isAdd ? 'aspectFit' : 'aspectFill'}
          />
          {
            (!(data.isAdd || data.isDefault) && mode === 'add') && <View className='img-delete' onClick={this.onDeleteImage.bind(this, data)}>删除</View>
          }
          {
            data.isDefault && <Image className='flag' mode='widthFix' src={defaultImg}></Image>
          }
        </View>
      )
    }
    )}
  </View>
  {/* 设置style内联样式 */}
  <Canvas style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px`, position: 'absolute', left: '-1000px', top: '-1000px' }} canvasId='myCanvas' />
</View >
```
设置布局图片布局均分3份`width: calc((100% - 40px) / 3)`
```
.chooseImageView {
  .choose-img-wrap {
    display: flex;
    flex-wrap: wrap;
    .img-container {
      height: 203px;
      width: calc((100% - 40px) / 3);
      margin-top: 20px;
      margin-left: 20px;
      position: relative;
      overflow: hidden;
      border-radius: 16px;
      &:nth-child(3n + 1) {
        margin-left: 0;
      }
      &:last-child {
        margin-bottom: 20px;
      }

      .img {
        width: 100%;
        height: 100%;
        background-color: #F9F9F9;
      }

      .flag {
        position: absolute;
        left: 0;
        top: 0;
        width: 100px;
        height: auto;
      }

      .img-delete {
        background-color: rgba($color: #000000, $alpha: 0.3);
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 50px;
        line-height: 50px;
        text-align: center;
        font-size: 22px;
        color: white;
      }
    }
  }
}
```
## 操作
### 图片添加
 利用taro的Taro.chooseImage即可实现图片的添加功能，通过传入count的数字来控制支持添加图片的最大张数
```
Taro.chooseImage({
  count: 1, // 默认9
  sizeType: ['original', 'compressed'], // 可以指定是原图还是压缩图，默认二者都有
  sourceType: ['album', 'camera'], // 可以指定来源是相册还是相机，默认二者都有，在H5浏览器端支持使用 `user` 和 `environment`分别指定为前后摄像头
  success: function (res) {
    // 返回选定照片的本地文件路径列表，tempFilePath可以作为img标签的src属性显示图片
    var tempFilePaths = res.tempFilePaths
  }
})
```
### 压缩图片
图片选择完成之后需要对图片进行压缩，要不然如果图片过大，上传必然会失败【试了10M的图片就可能会导致上传失败】，关于图片压缩又有2种可行方案
方案1：利用小程序提供的压缩方法实现压缩 通过传入quality来控制压缩质量 
```
Taro.compressImage({
  src: '', // 图片路径
  quality: 80 // 压缩质量
})
```
这个种方案确实可以压缩图片，但是呢，经试验论证这种方式压缩的图片返回路径没有图片的后缀名，这是很尴尬的事情，没有后缀名的路径发起上传服务端返回错误，尝试了下直接给路径添加后缀不能解决问题，方案1就先pass了   
不过，后来在写文章的时候才发现有人说可以给图片重新命名 利用renameSync来重新命名 代码我贴下面 是否可以使用，暂未验证
```
const newImagePath = `${wx.env.USER_DATA_PATH}/${+ new Date}.jpg` 
wx.getFileSystemManager().renameSync(tempFilePath,newImagePath) // 重命名图片
```
> 参考地址： https://developers.weixin.qq.com/community/develop/doc/000a4a770c82e08f7d1a55cc952000

方案2：利用canvasToTempFilePath绘制图片并取出路径 【本组件就是采用该方案】，使用Promise.all可以支持多图片同时压缩，压缩全部完成后取出图片路径并返回
支持最小压缩尺寸，如果尺寸小于设定最小尺寸则直接跳过压缩 支持根据图片大小动态设置压缩时间防止大图片压缩时间过短导致获取到的图片为白屏
```
compressfile = async (uploadFiles = []) => {
let that = this
const promises = uploadFiles.map(file => {
  return new Promise((resolve, reject) => {
    /// 压缩图片  图片小于300k直接上传 如果大于300k则压缩图片大小
    const maxSize = 300 * 1024
    const fileSize = file.size
    if (fileSize > maxSize) {
      Taro.getImageInfo(
        {
          src: file.path,
          success: async (data) => {
            //---------利用canvas压缩图片--------------
            var canvasWidth = data.width //图片原始长宽
            var canvasHeight = data.height

            if (canvasWidth > 500) {
              canvasWidth = 500
              canvasHeight = canvasHeight / (data.width / 500)
            }
            that.setState({
              canvasWidth,
              canvasHeight
            })
            let interval = 500
            /// 时间处理 根据图片大小 在导出图片时延时一定时间后开始处理返回数据，防止数据未导出成功
            const kb = fileSize / 1000
            if (kb < 1000) {
              interval = 500
            } else {
              interval = kb / 20
            }

            //----------绘制图形并取出图片路径--------------
            var ctx = Taro.createCanvasContext('myCanvas', that)
            ctx.drawImage(file.path, 0, 0, canvasWidth, canvasHeight)
            ctx.draw(false,
              setTimeout(() => {
                Taro.canvasToTempFilePath({
                  canvasId: 'myCanvas',
                  destWidth: canvasWidth,
                  destHeight: canvasHeight,
                  success: async function (data1) {
                    console.log(data1.tempFilePath)
                    resolve({
                      path: data1.tempFilePath
                    })
                  },
                  fail: function (data1) {
                    resolve({
                      path: data1.tempFilePath
                    })
                  }
                }, that)
              }, interval)
            )
          }
        }
      )
    } else {
      resolve(file)
    }
  })
})
Taro.showLoading({
  title: '图片压缩中'
})
const list = await Promise.all(promises)
Taro.hideLoading()
return list
}
```
这里图片压缩有不少坑，我这里把踩过的坑列举一下，如果你也遇到，可以少走很多弯路
* 创建context的时候需要传入this,绘图draw时也同样需要传入this
```
 var ctx = Taro.createCanvasContext('myCanvas', this)
   ctx.draw(false,()=>{},this) 
如果你的taro版本比较老 此处的this应该改为this.$scope最新的taro3.0以上无需如此
 var ctx = Taro.createCanvasContext('myCanvas', this.$scope)
   ctx.draw(false,()=>{},this.$scope) 
```
* 压缩时提示canvasToTempFilePath: fail canvas is empty，导致这个错误提示的可能性有很多种，比如上面创建时不传this就可能有这个报错，另外一个可能是为canvasId和创建画布时的id不一致就一定就有这个错误，关于画布Canvas这个东西 需要在布局中添加
```
 <Canvas style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px`, position: 'absolute', left: '-1000px', top: '-1000px' }} canvasId='myCanvas' />
记住 创建ctx两个id一定要保持一致
 var ctx = Taro.createCanvasContext('myCanvas', this)
```
刚开始做的时候不清楚需要在布局中实现Canvas组件，一直提示fail canvas is empty，都搞崩溃了，后来灵机一动想到了画布还没有添加呢，添加好画布后，就可以实现图片压缩了，压缩后导出图片路径回调即可

* ctx.draw绘制完成需要写在setTimeout中，由于ctx.draw是异步的，绘制图片需要时间，在回调中拿到的并不是绘制完成后的图片，如果延时过短，那么拿到的图片路径可能是空的白屏图片，所以我这里就根据图片大小动态的设置压缩时间
```
  let interval = 500
  /// 时间处理 根据图片大小 在导出图片时延时一定时间后开始处理返回数据，防止数据未导出成功
  const kb = fileSize / 1000
  if (kb < 1000) {
    interval = 500
  } else {
    interval = kb / 20
  }
var ctx = Taro.createCanvasContext('myCanvas', that)
ctx.drawImage(file.path, 0, 0, canvasWidth, canvasHeight)
ctx.draw(false,
  setTimeout(() => {
    Taro.canvasToTempFilePath({
      canvasId: 'myCanvas',
      destWidth: canvasWidth,
      destHeight: canvasHeight,
      success: async function (data1) {
        console.log(data1.tempFilePath)
        resolve({
          path: data1.tempFilePath
        })
      },
      fail: function (data1) {
        resolve({
          path: data1.tempFilePath
        })
      }
    }, that)
  }, interval)
)
```
### 图片上传 
图片上传使用uploadFile方法 这里同样通过Promise.all发起异步多图片上传，直到所有图片均上传完成拿到上传图片返回的地址回调显示
```
/**
 * 发起文件上传请求
 * @param {String} url 请求地址路径，相对路径或绝对路径
 * @param {Object} filePath 文件路径
 * @param {Object} options 额外请求配置对象，参考https://taro-docs.jd.com/taro/docs/apis/network/request/request
 */
async function uploadFile(url: string, filePath, name = 'file', options = {}) {
  const config = { ...baseConfig, ...options }
  const token = getGlobalData('token') || ''
  const appId = getGlobalData('appId')

  const requestParams: Taro.uploadFile.Option = {
    url: url,
    filePath,
    name: name,
    ...config
  }
  // 配置请求路径
  if (url.includes('http://') || url.includes('https://')) {
    requestParams.url = url
  } else {
    requestParams.url = BASE_URL + url
  }
  // 设置请求头
  requestParams.header = {
    appid: appId,
    token: token
  }
  return Taro.uploadFile(requestParams)
}

/**
 * 图片上传
 */
export const ImageUpload = (filePath) => {
  return uploadFile('/v1/upload', filePath, 'image')
}

/// 发起图片上传 异步上传
uploadFile = async (uploadFiles = []) => {
const promises = uploadFiles.map(data => {
  return new Promise((resolve, reject) => {
    return ImageUpload(data.url).then(res => {
      const resData = JSON.parse(res.data)
      if (resData.code === 0) {
        data.url = resData.data.image.fileUrl
        data.status = 'success'
        resolve(data)
      } else {
        Taro.showToast({
          title: resData.message,
          icon: 'none',
          mask: true
        })
        /// 上传失败
        data.status = 'fail'
        resolve(data)
      }
    }).catch(error => {
      Taro.showToast({
        title: '图片上传失败',
        icon: 'none',
        mask: true
      })
      data.status = 'fail'
      resolve(data)
    })
  })
})
Taro.showLoading({
  title: '图片上传中'
})
const list = await Promise.all(promises)
Taro.hideLoading()
return list
}
```
这里唯一需要注意的是多图片上传可能存在某一张图片上传失败的情况，我这里是通过status对返回的每张图片进行标记，如果status===success表示上传成功 status===fail表示上传失败

### 图片处理 
执行完图片压缩 图片上传后 下面对拿到的结果图片进行处理
```
///查询当前已经有多少张图片
const { files, maxCount } = this.state
const count = maxCount - files.length + 1
Taro.chooseImage({
  count: count, // 默认9
  sizeType: ['compressed'], // 可以指定是原图还是压缩图，默认二者都有
  sourceType: ['album', 'camera'], // 可以指定来源是相册还是相机，默认二者都有，在H5浏览器端支持使用 `user` 和 `environment`分别指定为前后摄像头
  success: async function (res) {
    // 返回选定照片的本地文件路径列表，tempFilePath可以作为img标签的src属性显示图片
    var tempFilePaths = res.tempFilePaths

    /// 图片压缩
    const tmpFiles = await that.compressfile(res.tempFiles)

    /// 将选中的图片存在files中 并添加一个tag值 tag值等于临时路径
    var tmpFileList = tmpFiles.map(file => {
      return {
        url: file.path,
        tag: file.path,
      }
    })

    /// 发起网络请求 将tag有值的数据进行上传 如果上传成功则移除tag值
    const successFiles = await (await that.uploadFile(tmpFileList)).filter(item => item.status === 'success').map(item => {
      delete item.status
      delete item.tag
      return item
    })

    /// 成功的数量<=0则不在走下面流程
    if (successFiles && successFiles.length <= 0) return

    await that.checkImage(successFiles)

    /// 保存files的值并通知外部刷新数据源
    await that.checkImage(successFiles, true)
  }
})
```
图片压缩完成后 将返回图片的包装成指定封装后发起上传图片操作 上传完成后通过filter筛选出上传成功的图片，并删除中间状态属性，如果全部上传失败则跳出循环 如果有成功上传的图片
则将图片插入到当前的图片列表中，并且根据图片的张数判断是否需要显示添加按钮，这些都操作完成之后刷新显示并通知
```
checkImage = async (tmpFileList = [], noti = false) => {
  return new Promise((resolve) => {
    ///1.拿到已经选中的file列表
    let { files, maxCount, mode } = this.state
    ///2.移除之前的addFile 
    const newFiles = files.filter((item, index) => {
      return item.isAdd !== true
    })

    ///3.合并列表
    if (tmpFileList && tmpFileList.length > 0) {
      newFiles.push(...tmpFileList)
    }

    ///4.数据返回上级
    if (this.props.onFileChange && noti) {
      this.props.onFileChange(newFiles)
    }

    ///5.判断新的addFile
    files = JSON.parse(JSON.stringify(newFiles))
    if (files.length < maxCount && mode === 'add') {
      /// 添加add按钮
      files.push(this.addFile())
    }
    /// 更新数据会有延迟 setTimeout来解决页面已经刷新 数据还没有变更过来的问题
    setTimeout(() => {
      this.setState({
        files
      }, () => {
        resolve(true)
      })
    }, 0)
  })
}

addFile = () => {
  const addImg = "https://kz-fe.oss-cn-hangzhou.aliyuncs.com/static/kzqipeimall/img/ic_tyre_upload.png"
  return {
    url: addImg,
    isAdd: true,
  }
}
```
整理图片：先拿到当前缓存中的所有图片，移除带有add标识的图片 将上传成功的图片添加到数据中，将数组中的数据通过this.props.onFileChange通知到外部 根据数组中的图片个数判断是否需要在最后添加addfile对象，完成以上操作后刷新显示即可
注意这里有一个小坑，就是执行this.setState之后我发现render()中取到的files数据并不是我们处理好的数据，而是处理前的数据，我的理解是setState需要时间，这里setState还没有执行完成赋值，页面就已经开始渲染了 
通过setTimeout延时0来完美的解决了这个问题
> 此处参考来源 https://www.jianshu.com/p/169aeb28c1bf
```
当setTimeout 延迟为0时 
setTimeout(() => {
  this.setState({
    files
  }, () => {
    resolve(true)
  })
}, 0)
```
### 图片删除
 files包含的对象支持相对于的属性设置 
```
{
  url:String,               //图片的url
  isAdd:Boolean,        //图片是否是添加按钮
  isDefault:Boolean,   //图片是否是默认    
  status:String,          //图片上传是否成功  success fail
}
```
当isDefault=true时，则该图片为默认图片，会自动在右上角添加一个默认flag标签
当 isAdd=true时 则该图片为添加图片按钮，点击后可以添加图片
当以上都为false时 则是普通图片，默认在图片的正下方添加了一个删除按钮，点击删除即可实现该图片的删除操作
```
onDeleteImage = (data) => {
  const { files } = this.state
  const newFiles = files.filter(item => {
    return item.url != data.url
  })
  this.setState(
    {
      files: newFiles
    }, () => {
      this.checkImage([], true)
    }
  )
}
```
图片删除后，需要注意将处理后的数据源通知到外部显示区域
### 图片预览
```
previewImage = (img, files) => {
  const imgs = files.filter(data => {
    return !data.isAdd
  }).map(item => {
    return item.url
  })
  Taro.previewImage({
    current: img, // 当前显示图片的http链接
    urls: imgs, // 需要预览的图片http链接列表
  })
}
```

### 关于使用
```
const files = [
  {
    url: 'https://kz-open-beta.oss-cn-hangzhou.aliyuncs.com/staging/100/saas/714922419294343168/86MZLaRKeGA264c9b77ebfb7ea690619762018705b81.png',
    isDefault: true,
  },
  {
    url: 'https://kz-open-beta.oss-cn-hangzhou.aliyuncs.com/staging/100/saas/714922439221481472/IWyagznkhdy5b98d02054df02f823399ad080386cf3d.png'
  }
]
<ChooseImageView files={item.files} maxCount="5" onFileChange={this.onFileChange.bind(this)} />
  onFileChange = (files) => {
    const { files } = this.state
    this.setState({
      files
    }, () => {
      console.log(this.state.files)
    })
  }
```
以上为全部内容

转载请标注来源：https://www.cnblogs.com/qqcc1388/p/16241602.html

