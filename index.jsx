import Taro, { uploadFile, ChooseFile } from '@tarojs/taro'
import React, { Component } from "react"
import { View, Image, Canvas } from "@tarojs/components"
import { AtInputNumber } from "taro-ui"
import { ImageUpload } from "@/services/tyre/tyre"
import Assets from "@/assets"
import "./index.scss"

export default class ChooseImageView extends Component {
  constructor(props) {
    super(props)
    this.state = {
      ...props,
      backData: JSON.stringify(props.files),           ///备份数据
      canvasWidth: 500,
      canvasHeight: 375
    }
    this.checkImage()
  }

  componentDidUpdate() {
    const {
      files,
    } = this.props
    /// 比较数据是否相同 相同则不刷新数据
    let { backData } = this.state
    if (JSON.stringify(this.props.files) == backData) {
      return
    }
    backData = JSON.stringify(this.props.files)
    let that = this
    this.setState({
      files,
      backData
    }, () => {
      that.checkImage()
    })
  }

  onImageClick = (data) => {
    let that = this
    if (data.isAdd) {
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

          /// 将选中的图片存在files中 
          var tmpFileList = tmpFiles.map(file => {
            return {
              url: file.path,
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

          /// 保存files的值并通知外部刷新数据源
          await that.checkImage(successFiles, true)
        }
      })
    } else {
      const { files } = this.state
      this.previewImage(data.url, files)
    }
  }

  /// 图片压缩
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

  /// 点击删除
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

  render() {
    const defaultImg = 'https://kz-fe.oss-cn-hangzhou.aliyuncs.com/static/kzqipeimall/img/ic_tyre_default.png'
    const { files, mode, canvasWidth, canvasHeight } = this.state
    return (
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
        {/* <Canvas style={`width: ${canvasWidth}px; height: ${canvasHeight}px;position: absolute;left:-1000px;top:-1000px;`} canvasId='myCanvas' /> */}
      </View >
    )
  }
}

ChooseImageView.defaultProps = {
  mode: 'add',  /// 显示模式 新增/详情   add | detail 
  files: [],    /// 图片列表
  maxCount: 9   ///最多上传张数
}

